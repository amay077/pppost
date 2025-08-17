const { BskyAgent } = require('@atproto/api');

const bskyEndpoint = 'https://bsky.social';

const handler = async (event) => {
  // CORS対応
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
      },
      body: '',
    };
  }

  try {
    const { sessionData } = JSON.parse(event.body);

    if (!sessionData) {
      return {
        statusCode: 400,
        headers: { 'Access-Control-Allow-Origin': '*' },
        body: JSON.stringify({ error: 'Session data is required' })
      };
    }

    // Bluesky Agentの初期化
    const agent = new BskyAgent({
      service: bskyEndpoint,
    });

    // セッション復元
    const sessionRes = await agent.resumeSession(sessionData);
    const did = sessionRes?.data?.did;

    // トークンリフレッシュ
    await agent.refreshSession();

    // 投稿一覧を取得
    const res = await agent.getAuthorFeed({ actor: did });

    const posts = (res?.data?.feed ?? []).map((p) => {
      const post = p.post;
      const postid = post.uri.substring(post.uri.lastIndexOf('/') + 1);
      const url = `https://bsky.app/profile/${post.author.handle}/post/${postid}`;
      const posted_at = (post.record as any)['createdAt'] ?? post.indexedAt;
      const text = `${(post.record as any)['text']}`;

      return { text, url, posted_at };
    });

    return {
      statusCode: 200,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        posts,
        sessionData: agent.session // 更新されたセッションデータを返す
      })
    };
  } catch (error) {
    console.error('Bluesky posts error:', error);
    return {
      statusCode: 500,
      headers: {
        'Access-Control-Allow-Origin': '*',
      },
      body: JSON.stringify({ error: error.message })
    };
  }
};

module.exports = { handler };