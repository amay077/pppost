const fetch = require('node-fetch')

const handler = async (event) => {
  console.log(`start handler - `, event);

  try {
    const token = event.queryStringParameters.token ?? 'empty';

    // 長命トークン（60 日）をリフレッシュ（client_secret 不要）
    const refreshRes = await fetch(`https://graph.threads.net/refresh_access_token?grant_type=th_refresh_token&access_token=${token}`);

    if (!refreshRes.ok) {
      console.error(`refresh token request failed: ${refreshRes.status}`, await refreshRes.text());
      return {
        statusCode: refreshRes.status,
        headers: {
          'Access-Control-Allow-Origin': '*',
        },
        body: JSON.stringify({ error: 'failed to refresh token' })
      }
    }

    const refreshJson = await refreshRes.json();

    const response = {
      statusCode: 200,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        access_token: refreshJson.access_token,
        token_type: refreshJson.token_type,
        expires_in: refreshJson.expires_in,
      })
    };
    console.log(`finish handler - `, response);

    return response;

  } catch (error) {
    console.log(`failed to refresh token:`, error);
    return { statusCode: 500, body: error.toString() }
  }
}

module.exports = { handler }
