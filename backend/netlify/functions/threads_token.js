const fetch = require('node-fetch')
const { generateSessionId, extractSessionId } = require('../lib/session');
const { saveToken } = require('../lib/token-store');

const handler = async (event) => {
  console.log(`start handler - `, event);

  // CORS対応
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        'Access-Control-Allow-Methods': 'GET, OPTIONS',
      },
      body: '',
    };
  }

  try {
    const code = event.queryStringParameters.code ?? 'empty';

    const client_id = process.env.PPPOST_THREADS_CLIENT_ID;
    const client_secret = process.env.PPPOST_THREADS_CLIENT_SECRET;
    const redirect_uri = process.env.PPPOST_THREADS_REDIRECT_URL;

    // 1. 短命トークンと user_id を取得
    const shortRes = await fetch(`https://graph.threads.net/oauth/access_token`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: `client_id=${client_id}&client_secret=${client_secret}&grant_type=authorization_code&code=${code}&redirect_uri=${redirect_uri}`,
    });

    if (!shortRes.ok) {
      console.error(`short-lived token request failed: ${shortRes.status}`, await shortRes.text());
      return {
        statusCode: shortRes.status,
        headers: {
          'Access-Control-Allow-Origin': '*',
        },
        body: JSON.stringify({ error: 'failed to get short-lived token' })
      }
    }

    const shortJson = await shortRes.json();
    const user_id = shortJson.user_id;
    const shortToken = shortJson.access_token;

    // 2. 長命トークン（60 日）へ交換
    const longRes = await fetch(`https://graph.threads.net/access_token?grant_type=th_exchange_token&client_secret=${client_secret}&access_token=${shortToken}`);

    if (!longRes.ok) {
      console.error(`long-lived token request failed: ${longRes.status}`, await longRes.text());
      return {
        statusCode: longRes.status,
        headers: {
          'Access-Control-Allow-Origin': '*',
        },
        body: JSON.stringify({ error: 'failed to get long-lived token' })
      }
    }

    const longJson = await longRes.json();

    // セッション ID: Bearer にあれば再利用、なければ新規発行
    const sessionId = extractSessionId(event) ?? generateSessionId();

    // 長命トークンは D1 に暗号化保存し、クライアントには返さない
    await saveToken(sessionId, 'threads', {
      access_token: longJson.access_token,
      token_type: longJson.token_type,
      expires_in: longJson.expires_in,
    }, { user_id });

    const response = {
      statusCode: 200,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        session_id: sessionId,
        user_id,
      })
    };
    console.log(`finish handler - `, response);

    return response;

  } catch (error) {
    console.log(`failed to get token:`, error);
    return { statusCode: 500, body: error.toString() }
  }
}

module.exports = { handler }
