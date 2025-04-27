const fetch = require('node-fetch')
const fs = require('fs');

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

const handler = async (event) => {
  console.info(`FIXME 後で消す  -> handler -> event:`, event);

  try {

    const { host, token, status, media_ids, reply_to_id } = JSON.parse(event.body); // as { refresh_token: string, text: string };

    // const { accessToken, accessSecret } = JSON.parse(decrypt(token));
    // console.info(`FIXME 後で消す  -> handler -> refresh_token:`, accessToken, accessSecret);

    const in_reply_to_id = reply_to_id ? reply_to_id : undefined;

    const res = await fetch(`https://${host}/api/v1/statuses`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ status, media_ids, in_reply_to_id }),
    });         

    const err = await res.text();
    console.log(`FIXME  後で消す  -> handler -> err:`, err);
    

    const response = {
      statusCode: res.status,
      headers: {
        'Access-Control-Allow-Origin': '*',
      },
      body: JSON.stringify({  })
    };
    console.info('post mastodon scceeded', response);
    return response;
  } catch (error) {
    console.log(`handler -> error:`, error);
    
    return { statusCode: 500, body: error.toString() }
  }
}

module.exports = { handler }