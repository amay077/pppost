const fetch = require('node-fetch');
const sharp = require('sharp');
const { BskyAgent, RichText } = require('@atproto/api');
const { extractSessionId } = require('../lib/session');
const { getToken, saveToken } = require('../lib/token-store');

const bskyEndpoint = 'https://bsky.social';

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
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
      },
      body: '',
    };
  }

  try {
    const sessionId = extractSessionId(event);
    if (sessionId == null) {
      return {
        statusCode: 401,
        headers: { 'Access-Control-Allow-Origin': '*' },
        body: JSON.stringify({ error: 'session required' })
      };
    }

    const stored = await getToken(sessionId, 'bluesky');
    if (stored == null) {
      return {
        statusCode: 400,
        headers: { 'Access-Control-Allow-Origin': '*' },
        body: JSON.stringify({ error: 'bluesky token not stored' })
      };
    }
    const sessionData = stored.token;

    const { text, images, video, reply_to_id, quote_to_id } = JSON.parse(event.body);
    console.log('Bluesky post request:', { text, images: images?.length, video: video != null, reply_to_id });

    // 動画と画像の併用は不可（フロントでも排他制御するが、サーバー側でも拒否する）
    if (video != null && Array.isArray(images) && images.length > 0) {
      return {
        statusCode: 400,
        headers: { 'Access-Control-Allow-Origin': '*' },
        body: JSON.stringify({ error: 'cannot post video with images' })
      };
    }
    // 動画とリプライ・引用の併用は不可
    if (video != null && ((reply_to_id?.length ?? 0) > 0 || (quote_to_id?.length ?? 0) > 0)) {
      return {
        statusCode: 400,
        headers: { 'Access-Control-Allow-Origin': '*' },
        body: JSON.stringify({ error: 'cannot post video with reply or quote' })
      };
    }

    // Bluesky Agentの初期化
    const agent = new BskyAgent({
      service: bskyEndpoint,
    });

    // セッション復元
    const sessionRes = await agent.resumeSession(sessionData);
    const did = sessionRes?.data?.did;

    // トークンリフレッシュ
    await agent.sessionManager.refreshSession();

    // 更新されたセッションデータを D1 に書き戻す（クライアントへは返さない）
    await saveToken(sessionId, 'bluesky', agent.session, {
      handle: agent.session.handle,
      did: agent.session.did,
    });

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

    // 動画処理（app.bsky.video.uploadVideo → getJobStatus ポーリング → app.bsky.embed.video）
    // 動画は画像・OGP と併用できない（フロントとサーバー側バリデーションで排他済み）
    // 動画のエンコード処理は数十秒かかることがあり、同期 Function の実行時間制約（約 10 秒）内に
    // 完了しないため、処理中は 202 を返してクライアントに bluesky_video_finalize での後続処理を促す。
    let videoJobId = null;
    const embedVideo = await (async () => {
      if (video == null || video.length === 0) {
        return undefined;
      }

      console.log(`Processing video: ${video}`);

      // ストレージ (R2) の公開URLから動画を取得
      const videoRes = await fetch(video);
      if (!videoRes.ok) {
        console.error(`Failed to fetch video from ${video}: ${videoRes.status}`);
        return null;
      }
      const videoBuffer = await videoRes.buffer();
      console.log(`Fetched video: ${videoBuffer.length} bytes`);

      // Bluesky は video/mp4 のみ受け付ける
      const encoding = 'video/mp4';

      // app.bsky.video.uploadVideo は PDS ではなく動画サービス（video.bsky.app）が提供する。
      // PDS（bsky.social）への呼び出しは 501 MethodNotImplemented になるため、
      // 公式ドキュメント（Recommended method）に従い以下を実施する:
      //   1. 動画サービスが PDS へ blob を保存するためのサービス トークンを発行
      //   2. video.bsky.app へ動画を直接アップロード
      //   3. video.bsky.app の getJobStatus で処理完了をポーリング
      const { data: serviceAuth } = await agent.com.atproto.server.getServiceAuth({
        aud: `did:web:${agent.dispatchUrl.host}`,
        lxm: 'com.atproto.repo.uploadBlob',
        exp: Math.floor(Date.now() / 1000) + 60 * 30, // 30 分
      });

      const uploadUrl = new URL('https://video.bsky.app/xrpc/app.bsky.video.uploadVideo');
      uploadUrl.searchParams.append('did', did);
      uploadUrl.searchParams.append('name', 'video.mp4');

      const uploadResponse = await fetch(uploadUrl, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${serviceAuth.token}`,
          'Content-Type': encoding,
          'Content-Length': String(videoBuffer.length),
        },
        body: videoBuffer,
      });
      if (!uploadResponse.ok) {
        console.error(`Video upload to video.bsky.app failed: ${uploadResponse.status}`, await uploadResponse.text());
        return null;
      }
      const uploadBody = await uploadResponse.json();
      const jobStatus = uploadBody.jobStatus ?? uploadBody;
      const jobId = jobStatus.jobId;
      console.log(`Video upload job started: ${jobId}`);

      // 状態確認は video.bsky.app に対して行う（PDS は getJobStatus を実装していない）
      const videoAgent = new BskyAgent({ service: 'https://video.bsky.app' });

      // 短時間だけポーリングして完了済みなら同期で投稿する（fast path）
      // 完了しなければ処理中（202）として扱い、bluesky_video_finalize で後続処理する
      const FAST_POLL_MAX_ATTEMPTS = 3;
      const FAST_POLL_INTERVAL_MS = 1000;

      let currentStatus = jobStatus;
      let blob = currentStatus.blob;
      for (let i = 0; i < FAST_POLL_MAX_ATTEMPTS && blob == null; i++) {
        const st = currentStatus.state;
        console.log(`Video job status (attempt ${i + 1}): ${st} (${currentStatus.progress ?? 0}%)`);
        if (st === 'JOB_STATE_FAILED') {
          console.error(`Video job failed: ${currentStatus.failureCode} ${currentStatus.message}`);
          return null;
        }
        await new Promise((resolve) => setTimeout(resolve, FAST_POLL_INTERVAL_MS));
        try {
          const { data: statusData } = await videoAgent.app.bsky.video.getJobStatus({ jobId: currentStatus.jobId });
          currentStatus = statusData.jobStatus;
          blob = currentStatus.blob ?? blob;
        } catch (error) {
          // 同一動画の再アップロード時など、動画が処理済みの場合（already_exists）は
          // エラー応答に処理済み動画の BlobRef が含まれることがある（公式ドキュメント推奨の扱い）。
          // XRPCError からは応答本文を取り出せないため、生のリクエストで BlobRef を確認する。
          console.error(`Video job status check failed:`, error.message, error.error);
          try {
            const rawRes = await fetch(
              `https://video.bsky.app/xrpc/app.bsky.video.getJobStatus?jobId=${encodeURIComponent(currentStatus.jobId)}`
            );
            const rawBody = await rawRes.json();
            if (rawBody?.blob != null) {
              blob = rawBody.blob;
              break;
            }
          } catch (rawError) {
            console.error(`Raw video job status check failed:`, rawError.message);
          }
          if (blob == null) {
            return null;
          }
        }
      }

      if (blob == null) {
        console.log(`Video job still processing: ${currentStatus.state}`);
        videoJobId = jobId;
        return { status: 'processing' };
      }

      return {
        $type: 'app.bsky.embed.video',
        video: blob,
        alt: 'Video',
      };
    })();

    // 動画処理に失敗した場合
    if (video != null && embedVideo === null) {
      return {
        statusCode: 500,
        headers: {
          'Access-Control-Allow-Origin': '*',
        },
        body: JSON.stringify({ error: 'Failed to process video' })
      };
    }

    // 動画が処理中の場合は 202 を返し、クライアントに bluesky_video_finalize での後続処理を促す
    if (video != null && embedVideo?.status === 'processing') {
      const response = {
        statusCode: 202,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ status: 'processing', job_id: videoJobId }),
      };
      console.info('bluesky video uploaded, waiting for finalize', response.body);
      return response;
    }

    // OGP処理（画像・動画がない場合のみ）
    const embedOgp = await (async () => {
      if (embedImages) return undefined; // 画像がある場合はOGPを使わない
      if (embedVideo) return undefined; // 動画がある場合はOGPを使わない
      
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

    // 引用処理
    // 引用元の uri / cid を解決し、app.bsky.embed.record を組み立てる。
    // 解決できない場合は null を返し、後段で失敗として扱う。
    const quoteEmbed = await (async () => {
      if (!quote_to_id || quote_to_id.length === 0) {
        return undefined;
      }

      const uri = `at://${did}/app.bsky.feed.post/${quote_to_id}`;
      const r = await agent.getPostThread({ uri });
      const th = r?.data?.thread;
      const cid = th?.post?.cid;
      if (cid == null) {
        return null;
      }

      return {
        $type: 'app.bsky.embed.record',
        record: { uri, cid },
      };
    })();

    // 引用元が解決できない場合は失敗として返す（通常投稿にフォールバックしない）
    if (quoteEmbed === null) {
      return {
        statusCode: 400,
        headers: {
          'Access-Control-Allow-Origin': '*',
        },
        body: JSON.stringify({ error: 'quote target not found' })
      };
    }

    // embed を組み立てる
    // 動画あり: 動画のみ（app.bsky.embed.video）。画像・OGP・引用との併用はバリデーションで排他済み
    // 引用あり: 画像・OGP が無ければ app.bsky.embed.record、あれば recordWithMedia で共存させる
    let embed = embedVideo ?? embedImages ?? embedOgp;
    if (quoteEmbed != null) {
      if (embed != null) {
        embed = {
          $type: 'app.bsky.embed.recordWithMedia',
          record: quoteEmbed,
          media: embed,
        };
      } else {
        embed = quoteEmbed;
      }
    }

    // 投稿
    const postRecord = {
      $type: 'app.bsky.feed.post',
      text: rt.text,
      facets: rt.facets,
      createdAt: new Date().toISOString(),
      embed,
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