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

  console.info(`FIXME 後で消す  -> handler -> event:`, event);

  try {

    const { host, token, status, media_ids, reply_to_id, images } = JSON.parse(event.body);

    // const { accessToken, accessSecret } = JSON.parse(decrypt(token));
    // console.info(`FIXME 後で消す  -> handler -> refresh_token:`, accessToken, accessSecret);

    // 画像アップロード処理
    let uploaded_media_ids = media_ids;
    
    if (images && images.length > 0 && !media_ids) {
      uploaded_media_ids = [];
      
      for (const imageUrl of images) {
        try {
          // Supabase URLから画像を取得
          const imageRes = await fetch(imageUrl);
          if (!imageRes.ok) {
            console.error(`Failed to fetch image from ${imageUrl}`);
            return {
              statusCode: 400,
              headers: {
                'Access-Control-Allow-Origin': '*',
              },
              body: JSON.stringify({ error: 'Failed to fetch image' })
            };
          }
          
          const imageBuffer = await imageRes.buffer();
          
          // FormDataを作成
          const FormData = require('form-data');
          const formData = new FormData();
          formData.append('file', imageBuffer, {
            filename: 'image.png',
            contentType: 'image/png'
          });
          
          // Mastodon APIに画像をアップロード
          const uploadRes = await fetch(`https://${host}/api/v1/media`, {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${token}`,
              ...formData.getHeaders()
            },
            body: formData
          });
          
          if (uploadRes.ok) {
            const uploadData = await uploadRes.json();
            uploaded_media_ids.push(uploadData.id);
          } else {
            console.error(`Failed to upload image to Mastodon:`, uploadRes.status, await uploadRes.text());
            return {
              statusCode: 400,
              headers: {
                'Access-Control-Allow-Origin': '*',
              },
              body: JSON.stringify({ error: 'Failed to upload image to Mastodon' })
            };
          }
        } catch (error) {
          console.error(`Error processing image:`, error);
          return {
            statusCode: 500,
            headers: {
              'Access-Control-Allow-Origin': '*',
            },
            body: JSON.stringify({ error: 'Image processing error' })
          };
        }
      }
    }

    const in_reply_to_id = reply_to_id ? reply_to_id : undefined;

    const res = await fetch(`https://${host}/api/v1/statuses`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ status, media_ids: uploaded_media_ids, in_reply_to_id }),
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