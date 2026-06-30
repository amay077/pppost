const fetch = require('node-fetch')
const sharp = require('sharp');

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

    const UPLOAD_DELAY_MS = 500;
    const media_ids = [];
    for (let i = 0; i < images.length; i++) {
      // 2枚目以降はディレイを入れて Cloudflare WAF のレート制限を回避
      if (i > 0) {
        await new Promise(resolve => setTimeout(resolve, UPLOAD_DELAY_MS));
      }

      // ストレージ (R2) の公開URLから画像を取得
      const res = await fetch(images[i], { method: 'GET' });
      if (!res.ok) {
        throw new Error(`Failed to fetch image ${i + 1}: ${res.status}`);
      }

      const buf = await res.arrayBuffer();
      let imageBuffer = Buffer.from(buf);
      let mimeType = res.headers.get('content-type') || 'image/jpeg';

      // 5MB制限チェック（5,242,880 bytes）
      const MAX_SIZE = 5242880;
      if (imageBuffer.length > MAX_SIZE) {
        console.log(`Image size ${imageBuffer.length} exceeds Twitter limit ${MAX_SIZE}, compressing...`);

        // 画像メタデータを取得
        const metadata = await sharp(imageBuffer).metadata();

        // 目標サイズの90%に圧縮（余裕を持たせる）
        const targetSize = MAX_SIZE * 0.9;
        const scaleFactor = Math.sqrt(targetSize / imageBuffer.length);

        // 新しいサイズを計算
        const newWidth = Math.max(1, Math.floor(metadata.width * scaleFactor));
        const newHeight = Math.max(1, Math.floor(metadata.height * scaleFactor));

        console.log(`Resizing from ${metadata.width}x${metadata.height} to ${newWidth}x${newHeight}`);

        // リサイズと圧縮
        imageBuffer = await sharp(imageBuffer)
          .resize(newWidth, newHeight, { fit: 'inside' })
          .jpeg({ quality: 85 })
          .toBuffer();

        console.log(`Compressed size: ${imageBuffer.length} bytes`);
        mimeType = 'image/jpeg';
      }

      const mediaRes = await twitterClient.v1.uploadMedia(imageBuffer, { mimeType });
      media_ids.push(mediaRes);
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
    console.error(`handler -> error:`, error);

    const statusCode = error.code === 403 ? 403 : 500;
    return {
      statusCode,
      headers: {
        'Access-Control-Allow-Origin': '*',
      },
      body: JSON.stringify({ error: error.message })
    };
  }
}

module.exports = { handler }