const fetch = require('node-fetch')
const { extractSessionId } = require('../lib/session');
const { getToken } = require('../lib/token-store');

const THREADS_API_BASE = 'https://graph.threads.net/v1.0';

const handler = async (event) => {
  // CORS対応
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
      },
      body: '',
    };
  }

  try {
    const sessionId = extractSessionId(event);
    if (sessionId == null) {
      return { statusCode: 401, headers: { 'Access-Control-Allow-Origin': '*' }, body: 'session required' };
    }

    const stored = await getToken(sessionId, 'threads');
    if (stored == null) {
      return { statusCode: 400, headers: { 'Access-Control-Allow-Origin': '*' }, body: 'threads token not stored' };
    }
    const token = stored.token.access_token;

    // 自分の投稿一覧を取得（reply 元候補）
    const url = `${THREADS_API_BASE}/me/threads?fields=id,text,permalink,timestamp&limit=25&access_token=${encodeURIComponent(token)}`;
    const res = await fetch(url);

    if (!res.ok) {
      console.error(`threads posts fetch failed: ${res.status}`, await res.text());
      return { statusCode: res.status, body: 'failed to fetch threads posts' };
    }

    const json = await res.json();
    const posts = Array.isArray(json.data) ? json.data : [];

    const results = posts.map((p) => ({
      id: p.id,
      text: p.text ?? '', // 画像のみの投稿は text を返さないため空文字に正規化
      url: p.permalink,
      posted_at: p.timestamp,
    }));

    const response = {
      statusCode: 200,
      headers: {
        'Access-Control-Allow-Origin': '*',
      },
      body: JSON.stringify(results)
    };
    console.info('posts threads succeeded', response);
    return response;
  } catch (error) {
    console.error(`handler -> error:`, error);
    return { statusCode: 500, body: error.toString() }
  }
}

module.exports = { handler }
