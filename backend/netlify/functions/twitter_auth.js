const fs = require('fs');

// Need for CORS
const resHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Credentials': true,
  'Content-Type': 'application/json',
};

// 暗号化関数
function encrypt(text) {
  const key = Buffer.from(process.env.PPPOST_DATA_SECRET).subarray(0, 32);
  const iv = Buffer.from(process.env.PPPOST_DATA_IV).subarray(0, 16);
  
  const crypto = require('crypto');
  const cipher = crypto.createCipheriv('aes-256-cbc', key, iv);
  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  return encrypted;
}

const handler = async (event) => {
  console.info(`FIXME 後で消す  -> handler -> event:`, event);

  try {
    const { TwitterApi } = require('twitter-api-v2');
    const client = new TwitterApi({ appKey: process.env.PPPOST_TWITTER_APPKEY , appSecret: process.env.PPPOST_TWITTER_APPSECRET });
    const authLink = await client.generateAuthLink(`oob`);

    console.info(authLink);

    const { oauth_token, url } = authLink;

    // 暗号化
    const data = encrypt(JSON.stringify(authLink));

    return {
      statusCode: 200,
      headers: resHeaders,
      body: JSON.stringify({ oauth_token, url, data })
    }
  } catch (error) {
    console.log(`FIXME 後で消す  -> handler -> error:`, error);
    return { statusCode: 500, body: error.toString() }
  }
}

module.exports = { handler }