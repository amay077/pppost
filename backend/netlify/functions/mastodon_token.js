const fetch = require('node-fetch')
const { generateSessionId, extractSessionId } = require('../lib/session');
const { saveToken } = require('../lib/token-store');

const mastodonSettings = [
  process.env.PPPOST_MASTODON_CLIENT_AUTH_MASTODON_CLOUD,
  process.env.PPPOST_MASTODON_CLIENT_AUTH_MASTODON_JP,
]
.map(x => x.split(' '))
.map(([server, client_id, client_secret]) => ({server, client_id, client_secret}))
.reduce((acc, cur) => {
  acc[cur.server] = cur;
  return acc;
}, {});

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
    const server = event.queryStringParameters.server ?? 'empty';
    const code = event.queryStringParameters.code ?? 'empty';

    const settings = mastodonSettings[server];
    if (settings == null) {
      console.error(`server not found: ${server}`);
      return {
        statusCode: 404,
        body: JSON.stringify({error: 'server not found'})
      }
    }

    const res = await fetch(`https://${settings.server}/oauth/token`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: `client_id=${settings.client_id}&client_secret=${settings.client_secret}&grant_type=authorization_code&code=${code}&redirect_uri=urn:ietf:wg:oauth:2.0:oob`,
    });

    if (!res.ok) {
      console.error(`token request failed: ${res.status}`)
      return {
        statusCode: res.status,
        body: JSON.stringify(res)
      }
    };

    const tokenResponse = await res.json();

    // セッション ID: Bearer にあれば再利用、なければ新規発行
    const sessionId = extractSessionId(event) ?? generateSessionId();

    // access_token は D1 に暗号化保存し、クライアントには返さない
    await saveToken(sessionId, 'mastodon', tokenResponse, { server: settings.server });

    const response = {
      statusCode: 200,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        session_id: sessionId,
        server: settings.server,
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
