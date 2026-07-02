const { BskyAgent } = require('@atproto/api');
const { generateSessionId, extractSessionId } = require('../lib/session');
const { saveToken } = require('../lib/token-store');

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
    const { identifier, password } = JSON.parse(event.body);

    if (!identifier || !password) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: 'Identifier and password are required' })
      };
    }

    // Bluesky Agentの初期化
    const agent = new BskyAgent({
      service: bskyEndpoint,
    });

    // ログイン
    await agent.login({
      identifier,
      password,
    });

    // セッション ID: Bearer にあれば再利用、なければ新規発行
    const sessionId = extractSessionId(event) ?? generateSessionId();

    // session データは D1 に暗号化保存し、クライアントには返さない
    await saveToken(sessionId, 'bluesky', agent.session, {
      handle: agent.session.handle,
      did: agent.session.did,
    });

    return {
      statusCode: 200,
      headers: {
        ...headers,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        session_id: sessionId,
        handle: agent.session.handle,
        did: agent.session.did,
      })
    };
  } catch (error) {
    console.error('Bluesky login error:', error);
    return {
      statusCode: 401,
      headers,
      body: JSON.stringify({ error: 'Login failed: ' + error.message })
    };
  }
};

module.exports = { handler };
