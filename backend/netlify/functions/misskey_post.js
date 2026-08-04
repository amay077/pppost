const fetch = require('node-fetch')
const FormData = require('form-data');
const { extractSessionId } = require('../lib/session');
const { getToken } = require('../lib/token-store');
const { isValidMisskeyHost, buildMisskeyOrigin } = require('../lib/misskey-host');

const handler = async (event) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
  };

  // CORS対応
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  try {
    const sessionId = extractSessionId(event);
    if (sessionId == null) {
      return {
        statusCode: 401,
        headers,
        body: JSON.stringify({ error: 'session required' })
      };
    }

    const stored = await getToken(sessionId, 'misskey');
    if (stored == null) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: 'misskey token not stored' })
      };
    }

    const host = stored.meta.host;
    if (!isValidMisskeyHost(host)) {
      console.error(`invalid misskey host in stored meta: ${host}`);
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: 'invalid host' })
      };
    }
    const origin = buildMisskeyOrigin(host);
    const token = stored.token.access_token;

    const { text, images, reply_to_id, quote_to_id } = JSON.parse(event.body);

    const hasImages = Array.isArray(images) && images.length > 0;

    // Misskey は本文と添付ファイルの双方が空のノートを受け付けない
    if ((text?.length ?? 0) <= 0 && !hasImages) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: 'text or images required' })
      };
    }

    // 画像アップロード処理（misskey.io の上限は 500 MB のためリサイズは行わない）
    // 1 枚あたり 10 秒近くかかるため、直列だと 3 枚で Netlify Function の
    // 実行時間上限（30 秒）を超える。並列化して枚数に比例しないようにする。
    const fileIds = [];

    if (hasImages) {
      const startedAt = Date.now();

      const results = await Promise.all(images.map(async (imageUrl) => {
        try {
          // ストレージ (R2) の公開URLから画像を取得
          const imageRes = await fetch(imageUrl);
          if (!imageRes.ok) {
            console.error(`Failed to fetch image from ${imageUrl}`);
            return { ok: false, statusCode: 400, error: 'Failed to fetch image' };
          }

          const imageBuffer = await imageRes.buffer();
          const contentType = imageRes.headers.get('content-type') || 'image/png';
          const ext = contentType.split('/')[1] || 'png';

          const formData = new FormData();
          formData.append('file', imageBuffer, {
            filename: `image.${ext}`,
            contentType,
          });

          const uploadRes = await fetch(`${origin}/api/drive/files/create`, {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${token}`,
              ...formData.getHeaders()
            },
            body: formData
          });

          if (!uploadRes.ok) {
            console.error(`Failed to upload image to Misskey:`, uploadRes.status, await uploadRes.text());
            return { ok: false, statusCode: 400, error: 'Failed to upload image to Misskey' };
          }

          const uploadData = await uploadRes.json();
          return { ok: true, id: uploadData.id };
        } catch (error) {
          console.error(`Error processing image:`, error);
          return { ok: false, statusCode: 500, error: 'Image processing error' };
        }
      }));

      console.info(`misskey drive upload: ${images.length} image(s) in ${Date.now() - startedAt} ms`);

      // 1 枚でも失敗したらノートは作成しない
      const failed = results.find(r => !r.ok);
      if (failed != null) {
        return {
          statusCode: failed.statusCode,
          headers,
          body: JSON.stringify({ error: failed.error })
        };
      }

      // Promise.all は入力順に解決するため、添付順は保たれる
      fileIds.push(...results.map(r => r.id));
    }

    // fileIds は空配列を受け付けないため、画像がある場合のみ含める
    const body = { text, visibility: 'public' };
    if (fileIds.length > 0) {
      body.fileIds = fileIds;
    }
    if ((reply_to_id?.length ?? 0) > 0) {
      body.replyId = reply_to_id;
    }
    if ((quote_to_id?.length ?? 0) > 0) {
      body.renoteId = quote_to_id;
    }

    const res = await fetch(`${origin}/api/notes/create`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      console.error(`misskey post failed: ${res.status}`, await res.text());
      return {
        statusCode: res.status,
        headers,
        body: JSON.stringify({ error: 'Failed to create note' })
      };
    }

    const created = await res.json();
    const noteId = created?.createdNote?.id;

    const response = {
      statusCode: 200,
      headers,
      body: JSON.stringify({ id: noteId, url: `${origin}/notes/${noteId}` })
    };
    console.info('post misskey succeeded', response);
    return response;
  } catch (error) {
    console.error(`misskey_post -> error:`, error);
    return { statusCode: 500, headers, body: error.toString() }
  }
}

module.exports = { handler }
