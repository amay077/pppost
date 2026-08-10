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
    // Threads API はトップレベル投稿（GET /me/threads）と返信（GET /me/replies）を別エンドポイントで返すため、
    // 両方を取得してマージする。返信を取得しないと、返信として投稿した内容が候補から欠落する（Issue #39）。
    const FETCH_ITEMS = [
      { label: 'threads', url: `${THREADS_API_BASE}/me/threads?fields=id,text,permalink,timestamp&limit=25&access_token=${encodeURIComponent(token)}` },
      { label: 'replies', url: `${THREADS_API_BASE}/me/replies?fields=id,text,permalink,timestamp&limit=25&access_token=${encodeURIComponent(token)}` },
    ];

    // 片方の取得に失敗しても他方の結果を返すため、部分成功を許容して取得する
    const settled = await Promise.all(
      FETCH_ITEMS.map(async ({ label, url }) => {
        const res = await fetch(url);
        if (!res.ok) {
          console.error(`threads ${label} fetch failed: ${res.status}`, await res.text());
          return { ok: false, posts: [] };
        }
        const json = await res.json();
        return { ok: true, posts: Array.isArray(json.data) ? json.data : [] };
      })
    );

    if (settled.every((s) => s.ok === false)) {
      console.error('threads posts and replies fetch both failed');
      return { statusCode: 500, body: 'failed to fetch threads posts' };
    }

    // トップレベル投稿と返信は API の仕様上重複しないが、万一の重複に備えて id で除去する
    const posts = [...new Map(settled.flatMap((s) => s.posts).map((p) => [p.id, p])).values()];

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
