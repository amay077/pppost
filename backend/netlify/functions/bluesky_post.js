const fetch = require('node-fetch');
const sharp = require('sharp');
const { BskyAgent, RichText } = require('@atproto/api');

const bskyEndpoint = 'https://bsky.social';

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

  try {
    const { sessionData, text, images, reply_to_id } = JSON.parse(event.body);
    console.log('Bluesky post request:', { text, images: images?.length, reply_to_id });

    // Bluesky Agentの初期化
    const agent = new BskyAgent({
      service: bskyEndpoint,
    });

    // セッション復元
    const sessionRes = await agent.resumeSession(sessionData);
    const did = sessionRes?.data?.did;

    // トークンリフレッシュ
    await agent.refreshSession();

    // 画像処理
    const MAX_SIZE = 1000000; // 1MB
    const embedImages = await (async () => {
      if (!images || images.length === 0) {
        return undefined;
      }

      const processedImages = [];
      
      for (let i = 0; i < images.length; i++) {
        const imageUrl = images[i];
        console.log(`Processing image ${i + 1}: ${imageUrl}`);
        
        try {
          // Supabase URLから画像を取得
          const imageRes = await fetch(imageUrl);
          if (!imageRes.ok) {
            console.error(`Failed to fetch image from ${imageUrl}: ${imageRes.status}`);
            return null;
          }

          let imageBuffer = await imageRes.buffer();
          let contentType = imageRes.headers.get('content-type') || 'image/jpeg';

          // 画像のメタデータを取得（サイズチェックの前に）
          const metadata = await sharp(imageBuffer).metadata();
          const aspectRatio = {
            width: metadata.width || 1,
            height: metadata.height || 1
          };
          console.log(`Image metadata: ${metadata.width}x${metadata.height}`);

          // 画像サイズをチェック
          if (imageBuffer.length > MAX_SIZE) {
            console.log(`Image ${i + 1} is too large (${imageBuffer.length} bytes), resizing...`);
            
            let resizeOptions = {};
            
            // アスペクト比を維持しながらリサイズ
            const scaleFactor = Math.sqrt(MAX_SIZE / imageBuffer.length) * 0.9; // 90%のサイズにして確実に1MB以下にする
            
            if (metadata.width && metadata.height) {
              resizeOptions = {
                width: Math.floor(metadata.width * scaleFactor),
                height: Math.floor(metadata.height * scaleFactor),
                fit: 'inside',
                withoutEnlargement: true
              };
              // リサイズ後のアスペクト比を更新
              aspectRatio.width = resizeOptions.width;
              aspectRatio.height = resizeOptions.height;
            }

            imageBuffer = await sharp(imageBuffer)
              .resize(resizeOptions)
              .jpeg({ quality: 85 }) // JPEGに変換して品質を下げる
              .toBuffer();
            
            contentType = 'image/jpeg';
            console.log(`Resized image to ${imageBuffer.length} bytes`);
          }

          // Blueskyにアップロード
          console.log(`Uploading to Bluesky: ${imageBuffer.length} bytes, ${contentType}`);
          const { data: uploadResult } = await agent.uploadBlob(
            imageBuffer,
            {
              encoding: contentType,
            }
          );
          console.log(`Upload result:`, uploadResult);

          processedImages.push({
            alt: `Image ${i + 1}`,
            image: uploadResult.blob,
            aspectRatio: aspectRatio
          });
        } catch (error) {
          console.error(`Error processing image ${i + 1}:`, error);
          return null;
        }
      }

      const embedResult = {
        $type: 'app.bsky.embed.images',
        images: processedImages
      };
      console.log('Embed images result:', JSON.stringify(embedResult, null, 2));
      return embedResult;
    })();

    // 画像処理に失敗した場合
    if (images && images.length > 0 && embedImages === null) {
      return {
        statusCode: 400,
        headers: {
          'Access-Control-Allow-Origin': '*',
        },
        body: JSON.stringify({ error: 'Failed to process images' })
      };
    }

    // RichTextの作成
    const rt = new RichText({ text });
    await rt.detectFacets(agent);

    // RichTextからURLを取得する
    const findUrlInText = (rt) => {
      if (!rt.facets || rt.facets.length < 1) return null;
      for (const facet of rt.facets) {
        if (facet.features.length < 1) continue;
        for (const feature of facet.features) {
          if (feature.$type !== "app.bsky.richtext.facet#link") continue;
          if (!feature.uri) continue;
          return feature.uri;
        }
      }
      return null;
    };

    // OGP処理（画像がない場合のみ）
    const embedOgp = await (async () => {
      if (embedImages) return undefined; // 画像がある場合はOGPを使わない
      
      const uri = findUrlInText(rt);
      if (!uri) return undefined;

      try {
        // OGP情報を取得（cors_proxyエンドポイントを使用）
        const corsProxyUrl = `${process.env.URL || 'http://localhost:9000'}/.netlify/functions/cors_proxy?url=${encodeURIComponent(uri)}`;
        const ogpRes = await fetch(corsProxyUrl);
        if (!ogpRes.ok) return undefined;

        const html = await ogpRes.text();
        
        // シンプルなOGPパーサー（cheerioを使用）
        const cheerio = require('cheerio');
        const $ = cheerio.load(html);
        const ogp = {};
        $('meta[property^="og:"]').each((_, elem) => {
          const property = $(elem).attr('property');
          const content = $(elem).attr('content');
          if (property && content) {
            ogp[property] = content;
          }
        });

        if (!ogp['og:image']) return undefined;

        // OGP画像を取得
        const fetchImageUrl = `${process.env.URL || 'http://localhost:9000'}/.netlify/functions/fetch_image?url=${encodeURIComponent(ogp['og:image'])}`;
        const imageRes = await fetch(fetchImageUrl);
        if (!imageRes.ok) return undefined;

        const dataURI = await imageRes.text();
        const [head, image] = dataURI.split(',');
        const parts = head.split(/[:;]/);
        const imageContentType = parts[1] || 'image/jpeg';

        // base64文字列をデコード
        const imageBuffer = Buffer.from(image, 'base64');

        // 画像をアップロード
        const { data: uploadResult } = await agent.uploadBlob(
          imageBuffer,
          { encoding: imageContentType }
        );

        // OGP埋め込みオブジェクトを返す
        return {
          $type: 'app.bsky.embed.external',
          external: {
            uri,
            thumb: {
              $type: "blob",
              ref: {
                $link: uploadResult.blob.ref.toString(),
              },
              mimeType: uploadResult.blob.mimeType,
              size: uploadResult.blob.size,
            },
            title: ogp['og:title'] || ' ',
            description: ogp['og:description'] || ' ',
          }
        };
      } catch (error) {
        console.error('Error processing OGP:', error);
        return undefined;
      }
    })();

    // リプライ処理
    const reply = await (async () => {
      if (!reply_to_id || reply_to_id.length === 0) {
        return undefined;
      }

      const uri = `at://${did}/app.bsky.feed.post/${reply_to_id}`;
      const r = await agent.getPostThread({ uri });
      const th = r?.data?.thread;
      
      const cid = th?.post?.cid;
      const parent = { uri, cid };
      const root = th?.post?.record?.reply?.root ?? parent;

      return { root, parent };
    })();

    // 投稿
    const postRecord = {
      $type: 'app.bsky.feed.post',
      text: rt.text,
      facets: rt.facets,
      createdAt: new Date().toISOString(),
      embed: embedImages || embedOgp, // 画像がある場合は画像、なければOGP
      reply
    };
    
    console.log('Post record:', JSON.stringify(postRecord, null, 2));

    const postRes = await agent.post(postRecord);

    return {
      statusCode: 200,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ 
        success: true,
        uri: postRes.uri,
        cid: postRes.cid,
        sessionData: agent.session
      })
    };
  } catch (error) {
    console.error('Bluesky post error:', error);
    return {
      statusCode: 500,
      headers: {
        'Access-Control-Allow-Origin': '*',
      },
      body: JSON.stringify({ error: error.message })
    };
  }
};

module.exports = { handler };