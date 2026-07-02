const { BskyAgent } = require('@atproto/api');
const { extractSessionId } = require('../lib/session');
const { getToken, saveToken } = require('../lib/token-store');

const bskyEndpoint = 'https://bsky.social';

const handler = async (event) => {
  // CORS headers
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
  };

  // CORS対応
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers,
      body: '',
    };
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

    const stored = await getToken(sessionId, 'bluesky');
    if (stored == null) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: 'bluesky token not stored' })
      };
    }
    const sessionData = stored.token;

    // Bluesky Agentの初期化
    const agent = new BskyAgent({
      service: bskyEndpoint,
    });

    // セッション復元
    console.log('Resuming session...');
    const sessionRes = await agent.resumeSession(sessionData);
    const did = sessionRes?.data?.did;
    console.log('Session resumed, DID:', did);

    // トークンリフレッシュ
    await agent.refreshSession();

    // 更新されたセッションデータを D1 に書き戻す（クライアントへは返さない）
    await saveToken(sessionId, 'bluesky', agent.session, {
      handle: agent.session.handle,
      did: agent.session.did,
    });

    // 投稿一覧を取得
    console.log('Getting author feed...');
    const res = await agent.getAuthorFeed({ actor: did });
    console.log('Feed response:', res?.data?.feed?.length, 'posts');

    const posts = (res?.data?.feed ?? []).map((p) => {
      const post = p.post;
      const postid = post.uri.substring(post.uri.lastIndexOf('/') + 1);
      const url = `https://bsky.app/profile/${post.author.handle}/post/${postid}`;
      const posted_at = post.record['createdAt'] || post.indexedAt;
      const text = `${post.record['text']}`;

      return { text, url, posted_at };
    });
    console.log('Mapped posts:', posts.length);

    return {
      statusCode: 200,
      headers: {
        ...headers,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        posts,
      })
    };
  } catch (error) {
    console.error('Bluesky posts error:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: error.message })
    };
  }
};

module.exports = { handler };
