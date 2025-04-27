const fetch = require('node-fetch')

// Need for CORS
const handler = async (event) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Credentials': true
  };

  try {
    const code = event.queryStringParameters.code ?? 'empty';
    const client_id = process.env.SHAREIMAT_FOURSQUARE_CLIENT_ID;
    const client_secret = process.env.SHAREIMAT_FOURSQUARE_CLIENT_SECRET;
    const redirect_uri = process.env.SHAREIMAT_FOURSQUARE_REDIRECT_URI;
    const grant_type = 'authorization_code';

    // パラメータ
    const query = new URLSearchParams({
      client_id,
      client_secret,
      grant_type,
      redirect_uri,
      code
    });

    const accessTokenUrl = `https://foursquare.com/oauth2/access_token?` + query;
    console.log(`handler ~ accessTokenUrl:`, accessTokenUrl, query);

    const res = await fetch(accessTokenUrl, {
      method: 'GET',
      headers: {
        'Access-Control-Allow-Origin': "*",
        'Accept': 'application/json'
      },      
    });

    if (!res.ok) {
      return {
        statusCode: res.status,
        headers,
        body: JSON.stringify(res)
      }
    };

    const tokenResponse = await res.json();
    console.log(`handler - `, tokenResponse); // { access_token: 'QWOxxxx' }
    const access_token = tokenResponse.access_token;

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ access_token })
    }
  } catch (error) {
    return { statusCode: 500, body: error.toString() }
  }
}

module.exports = { handler }