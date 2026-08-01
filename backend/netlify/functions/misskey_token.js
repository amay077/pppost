const fetch = require('node-fetch')
const { generateSessionId, extractSessionId } = require('../lib/session');
const { saveToken } = require('../lib/token-store');
const { isValidMisskeyHost, isValidMiAuthSession, buildMisskeyOrigin } = require('../lib/misskey-host');

const handler = async (event) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
  };

  // CORS対応
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  try {
    const host = event.queryStringParameters?.host;
    const miauthSession = event.queryStringParameters?.session;

    // ユーザー入力をそのまま外部 URL に埋め込むため、要求前に検証する
    if (!isValidMisskeyHost(host)) {
      console.error(`invalid misskey host: ${host}`);
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: 'invalid host' })
      };
    }
    if (!isValidMiAuthSession(miauthSession)) {
      console.error(`invalid miauth session: ${miauthSession}`);
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: 'invalid miauth session' })
      };
    }

    const origin = buildMisskeyOrigin(host);

    const res = await fetch(`${origin}/api/miauth/${miauthSession}/check`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });

    if (!res.ok) {
      console.error(`miauth check request failed: ${res.status}`, await res.text());
      return {
        statusCode: res.status,
        headers,
        body: JSON.stringify({ error: 'miauth check failed' })
      };
    }

    const checkResponse = await res.json();

    // ユーザーがまだ認可していない、またはセッションが無効
    if (checkResponse?.ok !== true) {
      console.error(`miauth not authorized yet:`, checkResponse);
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: 'not authorized' })
      };
    }

    // セッション ID: Bearer にあれば再利用、なければ新規発行
    const sessionId = extractSessionId(event) ?? generateSessionId();

    // access_token は D1 に暗号化保存し、クライアントには返さない
    await saveToken(sessionId, 'misskey', { access_token: checkResponse.token }, {
      host,
      user_id: checkResponse.user.id,
      username: checkResponse.user.username,
    });

    return {
      statusCode: 200,
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        session_id: sessionId,
        host,
        username: checkResponse.user.username,
      })
    };
  } catch (error) {
    console.error(`misskey_token -> error:`, error);
    return { statusCode: 500, headers, body: error.toString() }
  }
}

module.exports = { handler }
