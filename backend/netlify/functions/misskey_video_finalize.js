const fetch = require('node-fetch');
const { extractSessionId } = require('../lib/session');
const { getToken } = require('../lib/token-store');
const { isValidMisskeyHost, buildMisskeyOrigin } = require('../lib/misskey-host');

// misskey_post が 202 を返した動画投稿の最終化エンドポイント。
// drive/files/upload-from-url による Misskey 側の非同期取り込み（ダウンロード・サムネイル生成）が
// 完了するのを待ち、drive/files（read:drive 権限）から URL 由来のファイル名で対象を特定して、
// そのファイル ID を fileIds に含めて notes/create でノートを作成する。
// クライアントは 202 が返る間ポーリングし、200 で完了する。

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

    // R2 の動画 URL のファイル名（= drive に保存されるファイル名）を求める
    // 例: https://pub-xxx.r2.dev/pppost/video/1786269188476-abc123.mp4 → 1786269188476-abc123.mp4
    let filename;
    try {
      filename = decodeURIComponent(new URL(video_url).pathname.split('/').pop() ?? '');
    } catch {
      return errorResponse(400, 'invalid video_url');
    }
    if (filename.length === 0) {
      return errorResponse(400, 'cannot resolve filename from video_url');
    }

    // drive から対象ファイルを探す（動画のみ・作成日時降順の直近 100 件から名前照合）
    // drive/files は read:drive 権限が必要（アプリの MiAuth は read:drive を含めて要求する）
    const filesRes = await fetch(`${origin}/api/drive/files`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        type: 'video/*',
        sort: '-createdAt',
        limit: 100,
      }),
    });

    if (!filesRes.ok) {
      const bodyText = await filesRes.text();
      console.error(`Failed to fetch drive files: ${filesRes.status}`, bodyText);
      // 権限不足（再連携前のセッション）の場合は原因が分かるエラーを返す
      if (filesRes.status === 403 && bodyText.includes('PERMISSION_DENIED')) {
        return errorResponse(500, 'Misskey の再連携が必要です（read:drive 権限）。Misskey 接続をやり直してください');
      }
      return errorResponse(500, 'Failed to fetch drive files');
    }

    const files = await filesRes.json();
    const fileList = Array.isArray(files) ? files : [];
    console.log(`misskey drive search: looking for "${filename}", ${fileList.length} recent video file(s) found`);
    console.log('misskey drive file names:', fileList.map((f) => `${f.name} (${f.id})`).join(', ') || '(none)');
    const target = fileList.find((f) => f.name === filename);

    if (target == null) {
      // まだ Misskey 側の取り込み・処理が完了していない: クライアントに再ポーリングを促す
      console.log(`misskey drive file not found yet: ${filename}`);
      return {
        statusCode: 202,
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'processing', video_url }),
      };
    }

    console.log(`misskey drive file found: ${target.id} (${target.name})`);

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
        fileIds: [target.id],
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
    return { statusCode: 500, headers, body: JSON.stringify({ error: error.message }) }
  }
};

module.exports = { handler }
