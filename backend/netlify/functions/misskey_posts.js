const fetch = require('node-fetch')
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

    // ユーザー ID は接続時に保管済みのため /api/i は呼ばない
    const userId = stored.meta.user_id;

    // 自分のリプライは Bluesky と同様に候補へ含める。リノートのみ除外する。
    const res = await fetch(`${origin}/api/users/notes`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        userId,
        withRenotes: false,
        withReplies: true,
        limit: 20,
      }),
    });

    if (!res.ok) {
      console.error(`misskey posts failed: ${res.status}`, await res.text());
      return {
        statusCode: res.status,
        headers,
        body: JSON.stringify({ error: 'Failed to fetch notes' })
      };
    }

    const notes = await res.json();

    // 画像のみのノートは text が null になるため空文字として扱う
    const results = notes.map(n => ({
      url: `${origin}/notes/${n.id}`,
      posted_at: n.createdAt,
      text: n.text ?? '',
      id: n.id,
    }));

    const response = {
      statusCode: 200,
      headers,
      body: JSON.stringify(results)
    };
    console.info('posts misskey succeeded', response);
    return response;
  } catch (error) {
    console.error(`misskey_posts -> error:`, error);
    return { statusCode: 500, headers, body: error.toString() }
  }
}

module.exports = { handler }
