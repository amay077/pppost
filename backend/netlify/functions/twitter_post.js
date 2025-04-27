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
    const { token, text, images, reply_to_id } = JSON.parse(event.body); // as { refresh_token: string, text: string };

    const { accessToken, accessSecret } = JSON.parse(decrypt(token));
    console.info(`FIXME 後で消す2  -> handler -> refresh_token:`, accessToken, accessSecret);

    const { TwitterApi } = require('twitter-api-v2');
    const twitterClient = new TwitterApi({
      appKey: process.env.PPPOST_TWITTER_APPKEY, 
      appSecret: process.env.PPPOST_TWITTER_APPSECRET,
      accessToken,
      accessSecret, 
    });

    const media_ids = [];
    for (const image of images) {
     
      const res = await fetch(image, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${process.env.PPPOST_GITHUB_ACCESS_TOKEN}`,
        },
      });
      if (res.ok) {
        const buf = await res.arrayBuffer();

        const localPath = `/tmp/${new Date().toISOString()}.data`

        fs.writeFileSync(localPath, Buffer.from(buf));
        const mediaRes = await twitterClient.v1.uploadMedia(localPath);
        media_ids.push(mediaRes);
      }
    }

    const media = (() => {
      if (media_ids.length <= 0) {
        return undefined;
      }

      return {
        media_ids
      };
    })();

    if ((reply_to_id?.length ?? 0) <= 0) {
      await twitterClient.v2.tweet(text, { media });
    } else {
      await twitterClient.v2.reply(text, reply_to_id, { media });
    }

    const response = {
      statusCode: 200,
      headers: {
        'Access-Control-Allow-Origin': '*',
      },
      body: JSON.stringify({  })
    };
    console.info('3. tweet scceeded', response);
    return response;
  } catch (error) {
    console.log(`handler -> error:`, error);
    
    return { statusCode: 500, body: error.toString() }
  }
}

module.exports = { handler }