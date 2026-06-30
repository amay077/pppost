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

// 画像リサイズ共通関数
async function resizeImageIfNeeded(imageBuffer, maxSize, context = 'Image') {
  if (imageBuffer.length <= maxSize) {
    return {
      buffer: imageBuffer,
      contentType: null, // 変更なし
      resized: false
    };
  }

  console.log(`${context} is too large (${imageBuffer.length} bytes), resizing to fit ${maxSize} bytes...`);
  
  const metadata = await sharp(imageBuffer).metadata();
  const scaleFactor = Math.sqrt(maxSize / imageBuffer.length) * 0.9; // 90%のサイズにして確実に制限以下にする
  
  const resizeOptions = {
    width: Math.floor(metadata.width * scaleFactor),
    height: Math.floor(metadata.height * scaleFactor),
    fit: 'inside',
    withoutEnlargement: true
  };

  const resizedBuffer = await sharp(imageBuffer)
    .resize(resizeOptions)
    .jpeg({ quality: 80 }) // JPEGに変換して品質を下げる
    .toBuffer();
  
  console.log(`Resized ${context} to ${resizedBuffer.length} bytes`);
  
  return {
    buffer: resizedBuffer,
    contentType: 'image/jpeg',
    resized: true,
    aspectRatio: {
      width: resizeOptions.width,
      height: resizeOptions.height
    }
  };
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
    const MAX_SIZE = 976560; // 976.56KB (Blueskyの実際の制限)
    const embedImages = await (async () => {
      if (!images || images.length === 0) {
        return undefined;
      }

      const processedImages = [];
      
      for (let i = 0; i < images.length; i++) {
        const imageUrl = images[i];
        console.log(`Processing image ${i + 1}: ${imageUrl}`);
        
        try {
          // ストレージ (R2) の公開URLから画像を取得
          const imageRes = await fetch(imageUrl);
          if (!imageRes.ok) {
            console.error(`Failed to fetch image from ${imageUrl}: ${imageRes.status}`);
            return null;
          }

          const originalBuffer = await imageRes.buffer();
          let contentType = imageRes.headers.get('content-type') || 'image/jpeg';

          // 画像のメタデータを取得
          const metadata = await sharp(originalBuffer).metadata();
          let aspectRatio = {
            width: metadata.width || 1,
            height: metadata.height || 1
          };
          console.log(`Image metadata: ${metadata.width}x${metadata.height}`);

          // 画像リサイズ処理（共通関数を使用）
          const resizeResult = await resizeImageIfNeeded(originalBuffer, MAX_SIZE, `Image ${i + 1}`);
          const imageBuffer = resizeResult.buffer;
          
          if (resizeResult.resized) {
            contentType = resizeResult.contentType;
            aspectRatio = resizeResult.aspectRatio;
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

    // YouTube動画URLから動画IDを抽出する（YouTubeでなければnull）
    // 対応形式: youtu.be/{id}, youtube.com/watch?v={id}, /shorts/{id}, /embed/{id}, /v/{id}
    const extractYouTubeVideoId = (urlStr) => {
      try {
        const u = new URL(urlStr);
        const host = u.hostname.replace(/^www\.|^m\./, '');
        const ID = /^[A-Za-z0-9_-]{11}$/;
        if (host === 'youtu.be') {
          const id = u.pathname.slice(1).split('/')[0];
          return ID.test(id) ? id : null;
        }
        if (host === 'youtube.com' || host === 'youtube-nocookie.com') {
          if (u.pathname === '/watch') {
            const v = u.searchParams.get('v');
            return v && ID.test(v) ? v : null;
          }
          const m = u.pathname.match(/^\/(?:shorts|embed|v)\/([A-Za-z0-9_-]{11})/);
          return m ? m[1] : null;
        }
        return null;
      } catch {
        return null;
      }
    };

    // OGP処理（画像がない場合のみ）
    const embedOgp = await (async () => {
      if (embedImages) return undefined; // 画像がある場合はOGPを使わない
      
      const uri = findUrlInText(rt);
      if (!uri) return undefined;

      const youtubeId = extractYouTubeVideoId(uri);

      // YouTubeはHTMLスクレイピングが不安定なため、oEmbedでタイトルを確実に取得する（best-effort）
      let youtubeTitle = null;
      if (youtubeId) {
        try {
          const watchUrl = `https://www.youtube.com/watch?v=${youtubeId}`;
          const oembedUrl = `https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(watchUrl)}`;
          const oembedRes = await fetch(oembedUrl);
          if (oembedRes.ok) {
            const data = await oembedRes.json();
            if (data && typeof data.title === 'string' && data.title.trim()) {
              youtubeTitle = data.title.trim();
            }
          }
        } catch (error) {
          console.error('Error fetching YouTube oEmbed:', error);
        }
      }

      try {
        // OGP情報を取得（cors_proxyエンドポイントを使用）
        // YouTubeはHTML取得が不安定なため、失敗してもタイトル・説明文を空のまま続行し、
        // サムネイルは動画IDから直接生成する（best-effort）
        const ogp = {};
        try {
          const corsProxyUrl = `${process.env.URL || 'http://localhost:9000'}/.netlify/functions/cors_proxy?url=${encodeURIComponent(uri)}`;
          const ogpRes = await fetch(corsProxyUrl);
          if (ogpRes.ok) {
            const html = await ogpRes.text();

            // シンプルなOGPパーサー（cheerioを使用）
            const cheerio = require('cheerio');
            const $ = cheerio.load(html);
            $('meta[property^="og:"]').each((_, elem) => {
              const property = $(elem).attr('property');
              const content = $(elem).attr('content');
              if (property && content) {
                ogp[property] = content;
              }
            });
          }
        } catch (error) {
          console.error('Error fetching OGP metadata:', error);
        }

        // サムネイル画像URLの候補を決定する
        // YouTube: 動画IDから直接組み立て（maxresdefault→hqdefaultの順にフォールバック）
        // それ以外: OGPのog:imageを使用（従来通り）
        const imageCandidates = youtubeId
          ? [
              `https://img.youtube.com/vi/${youtubeId}/maxresdefault.jpg`,
              `https://img.youtube.com/vi/${youtubeId}/hqdefault.jpg`,
            ]
          : (ogp['og:image'] ? [ogp['og:image']] : []);

        if (imageCandidates.length < 1) return undefined;

        // 候補を順にfetch_imageで取得し、最初に成功したものを使う
        // （maxresdefaultが未生成=404の場合は次候補へフォールバック）
        let dataURI = null;
        for (const imageUrl of imageCandidates) {
          const fetchImageUrl = `${process.env.URL || 'http://localhost:9000'}/.netlify/functions/fetch_image?url=${encodeURIComponent(imageUrl)}`;
          const imageRes = await fetch(fetchImageUrl);
          if (imageRes.ok) {
            dataURI = await imageRes.text();
            break;
          }
        }
        if (!dataURI) return undefined;

        const [head, image] = dataURI.split(',');
        const parts = head.split(/[:;]/);
        const imageContentType = parts[1] || 'image/jpeg';

        // base64文字列をデコード
        const originalBuffer = Buffer.from(image, 'base64');

        // OGP画像のリサイズ処理（共通関数を使用）
        const OGP_MAX_SIZE = 976560; // 976.56KB (Blueskyの制限)
        const resizeResult = await resizeImageIfNeeded(originalBuffer, OGP_MAX_SIZE, 'OGP image');
        const imageBuffer = resizeResult.buffer;
        const imageEncoding = resizeResult.resized ? 'image/jpeg' : imageContentType;

        // 画像をアップロード
        const { data: uploadResult } = await agent.uploadBlob(
          imageBuffer,
          { encoding: imageEncoding }
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
            title: youtubeTitle || ogp['og:title'] || (youtubeId ? 'YouTube' : ' '),
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