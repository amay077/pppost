const fetch = require('node-fetch')

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
    const { user_id, token, text } = JSON.parse(event.body);

    // 1. メディアコンテナ作成（media_type=TEXT）
    const createRes = await fetch(`https://graph.threads.net/v1.0/me/threads`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: `media_type=TEXT&text=${encodeURIComponent(text)}&access_token=${encodeURIComponent(token)}`,
    });

    if (!createRes.ok) {
      console.error(`threads container creation failed: ${createRes.status}`, await createRes.text());
      return {
        statusCode: createRes.status,
        headers: {
          'Access-Control-Allow-Origin': '*',
        },
        body: JSON.stringify({ error: 'failed to create threads container' })
      };
    }

    const createJson = await createRes.json();
    const creation_id = createJson.id;

    // 2. 公開
    const publishRes = await fetch(`https://graph.threads.net/v1.0/me/threads_publish`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: `creation_id=${encodeURIComponent(creation_id)}&access_token=${encodeURIComponent(token)}`,
    });

    if (!publishRes.ok) {
      console.error(`threads publish failed: ${publishRes.status}`, await publishRes.text());
      return {
        statusCode: publishRes.status,
        headers: {
          'Access-Control-Allow-Origin': '*',
        },
        body: JSON.stringify({ error: 'failed to publish threads' })
      };
    }

    const response = {
      statusCode: 200,
      headers: {
        'Access-Control-Allow-Origin': '*',
      },
      body: JSON.stringify({})
    };
    console.info('post threads succeeded', response);
    return response;
  } catch (error) {
    console.log(`handler -> error:`, error);
    return { statusCode: 500, body: error.toString() }
  }
}

module.exports = { handler }
