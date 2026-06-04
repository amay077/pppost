const fetch = require('node-fetch')

const handler = async (event) => {
  console.log(`start handler - `, event);

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

    // 長命トークン交換は threads_basic の App Review 承認後に有効化予定。
    // 暫定: 短命トークン（約 1 時間）をそのまま返す。
    const response = {
      statusCode: 200,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        user_id,
        access_token: shortToken,
        token_type: 'Bearer',
        expires_in: 3600,
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
