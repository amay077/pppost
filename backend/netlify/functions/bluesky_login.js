const { BskyAgent } = require('@atproto/api');

const bskyEndpoint = 'https://bsky.social';

const handler = async (event) => {
  // CORS headers
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
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

    return {
      statusCode: 200,
      headers: {
        ...headers,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        success: true,
        sessionData: agent.session
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