const fetch = require('node-fetch');
const FormData = require('form-data');
const { extractSessionId } = require('../lib/session');
const { getToken } = require('../lib/token-store');
const { isValidMisskeyHost, buildMisskeyOrigin } = require('../lib/misskey-host');

// misskey_post が 202 を返した動画投稿の最終化エンドポイント。
// R2 から動画を取得して drive/files/create（write:drive 権限）で drive へアップロードし、
// そのファイル ID を fileIds に含めて notes/create でノートを作成する。
// クライアントは 202 が返る間ポーリングし、200 で完了する。
//
// 設計メモ: drive からのファイル検索（drive/files）は read:drive 権限が必要だが、
// アプリの MiAuth は write:notes,write:drive,read:account のみを要求するため
// （再接続を強制しないため）、検索 API は使わない。

const errorResponse = (statusCode, error) => ({
  statusCode,
  headers: {
    'Access-Control-Allow-Origin': '*',
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({ error }),
});

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
      return errorResponse(400, 'invalid host');
    }
    const origin = buildMisskeyOrigin(host);
    const token = stored.token.access_token;

    const { text, video_url } = JSON.parse(event.body);
    if (typeof video_url !== 'string' || video_url.length === 0) {
      return errorResponse(400, 'video_url required');
    }

    // ストレージ (R2) の公開URLから動画を取得
    const startedAt = Date.now();
    const videoRes = await fetch(video_url);
    if (!videoRes.ok) {
      console.error(`Failed to fetch video from ${video_url}: ${videoRes.status}`);
      return errorResponse(500, 'Failed to fetch video');
    }
    const videoBuffer = await videoRes.buffer();
    const contentType = videoRes.headers.get('content-type') || 'video/mp4';
    const ext = contentType.split('/')[1] || 'mp4';
    console.log(`Fetched video: ${videoBuffer.length} bytes (${contentType})`);

    // drive/files/create で drive へアップロードする（write:drive 権限・画像投稿と同じ経路）
    // 動画サムネイル生成（ffmpeg）などで時間がかかることがあるが、
    // 本関数は独立した呼び出しのため、実行時間制限をフルに使える。
    // タイムアウト後に再試行された場合、同一ハッシュの既存ファイルが返されるため収束する。
    const formData = new FormData();
    formData.append('file', videoBuffer, {
      filename: `video.${ext}`,
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
      console.error(`Failed to upload video to Misskey:`, uploadRes.status, await uploadRes.text());
      return errorResponse(500, 'Failed to upload video to Misskey');
    }

    const uploadData = await uploadRes.json();
    const fileId = uploadData.id;
    console.log(`Uploaded video to drive: ${fileId} (${Date.now() - startedAt} ms)`);

    // ノートを作成する
    const noteRes = await fetch(`${origin}/api/notes/create`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        text,
        visibility: 'public',
        fileIds: [fileId],
      }),
    });

    if (!noteRes.ok) {
      console.error(`misskey note creation failed: ${noteRes.status}`, await noteRes.text());
      return errorResponse(noteRes.status, 'Failed to create note');
    }

    const created = await noteRes.json();
    const noteId = created?.createdNote?.id;
    console.log(`misskey note created: ${noteId}`);

    const response = {
      statusCode: 200,
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: noteId, url: `${origin}/notes/${noteId}` })
    };
    console.info('misskey video finalize succeeded', response.body);
    return response;
  } catch (error) {
    console.error(`misskey_video_finalize -> error:`, error);
    return { statusCode: 500, headers, body: error.toString() }
  }
};

module.exports = { handler }
