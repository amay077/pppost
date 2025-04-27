const fs = require('fs');

// Need for CORS
const resHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Credentials': true,
  'Content-Type': 'application/json',
};

// 復号化関数
function decrypt(encryptedText) {
  const key = Buffer.from(process.env.PPPOST_DATA_SECRET).subarray(0, 32);
  const iv = Buffer.from(process.env.PPPOST_DATA_IV).subarray(0, 16);
  
  const crypto = require('crypto');
  const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv);
  let decrypted = decipher.update(encryptedText, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  return decrypted;
}

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
    const code = event.queryStringParameters.code ?? 'empty';
    const oauth_token = event.queryStringParameters.oauth_token ?? 'empty';
    const data = event.queryStringParameters.data ?? 'empty';

    const oauth_token_secret = JSON.parse(decrypt(data)).oauth_token_secret;

    const { TwitterApi } = require('twitter-api-v2');
    const authClient = new TwitterApi({ 
      appKey: process.env.PPPOST_TWITTER_APPKEY, 
      appSecret: process.env.PPPOST_TWITTER_APPSECRET,
      accessToken: oauth_token,
      accessSecret: oauth_token_secret,
    });

    const { accessToken, accessSecret } = await authClient.login(code);
    console.info(`handler - `, accessToken, accessSecret); 

    const token = encrypt(JSON.stringify({ accessToken, accessSecret }));
    
    return {
      statusCode: 200,
      headers: resHeaders,
      body: JSON.stringify({ accessToken, accessSecret, token })
    }
  } catch (error) {
    console.log(`FIXME 後で消す  -> handler -> error:`, error);
    return { statusCode: 500, body: error.toString() }
  }
}

module.exports = { handler }