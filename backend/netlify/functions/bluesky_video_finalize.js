const { BskyAgent, RichText } = require('@atproto/api');
const { extractSessionId } = require('../lib/session');
const { getToken, saveToken } = require('../lib/token-store');

const bskyEndpoint = 'https://bsky.social';

// Netlify 同期 Function の実行時間制限（10 秒）に対する全体予算
const OVERALL_BUDGET_MS = 8500;
// ジョブ状態のポーリング間隔
const POLL_INTERVAL_MS = 2000;

const errorResponse = (statusCode, error) => ({
  statusCode,
  headers: {
    'Access-Control-Allow-Origin': '*',
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({ error }),
});

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
      return errorResponse(401, 'session required');
    }

    const stored = await getToken(sessionId, 'bluesky');
    if (stored == null) {
      return errorResponse(400, 'bluesky token not stored');
    }
    const sessionData = stored.token;

    const { job_id, text } = JSON.parse(event.body);
    if (typeof job_id !== 'string' || job_id.length === 0) {
      return errorResponse(400, 'job_id required');
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

    // 動画の処理完了（blob の取得）をポーリングする
    // 状態確認は動画サービス（video.bsky.app）に対して行う（PDS は getJobStatus を実装していない）
    const videoAgent = new BskyAgent({ service: 'https://video.bsky.app' });

    const deadline = Date.now() + OVERALL_BUDGET_MS;
    let blob = null;
    let lastState = null;

    while (Date.now() + POLL_INTERVAL_MS <= deadline) {
      let jobStatus;
      try {
        const { data: statusData } = await videoAgent.app.bsky.video.getJobStatus({ jobId: job_id });
        jobStatus = statusData.jobStatus;
      } catch (error) {
        // 同一動画の再アップロード時など、動画が処理済みの場合（already_exists）は
        // エラー応答に処理済み動画の BlobRef が含まれることがあるため、生のリクエストで確認する
        console.error(`Video job status check failed:`, error.message, error.error);
        try {
          const rawRes = await fetch(
            `https://video.bsky.app/xrpc/app.bsky.video.getJobStatus?jobId=${encodeURIComponent(job_id)}`
          );
          const rawBody = await rawRes.json();
          if (rawBody?.blob != null) {
            blob = rawBody.blob;
            break;
          }
        } catch (rawError) {
          console.error(`Raw video job status check failed:`, rawError.message);
        }
        return errorResponse(500, 'failed to check video job status');
      }

      const st = jobStatus.state;
      lastState = st;
      console.log(`Video job status: ${st} (${jobStatus.progress ?? 0}%)`);

      if (jobStatus.blob != null) {
        blob = jobStatus.blob;
        break;
      }
      if (st === 'JOB_STATE_FAILED') {
        console.error(`Video job failed: ${jobStatus.failureCode} ${jobStatus.message}`);
        return errorResponse(500, 'video processing failed');
      }

      await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
    }

    if (blob == null) {
      // まだ処理中: クライアントに再ポーリングを促す
      console.log(`Video job still processing: ${lastState}`);
      return {
        statusCode: 202,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ status: 'processing', job_id }),
      };
    }

    // RichTextの作成（本文のファセット検出）
    const rt = new RichText({ text });
    await rt.detectFacets(agent);

    // 動画埋め込みで投稿する
    const postRecord = {
      $type: 'app.bsky.feed.post',
      text: rt.text,
      facets: rt.facets,
      createdAt: new Date().toISOString(),
      embed: {
        $type: 'app.bsky.embed.video',
        video: blob,
        alt: 'Video',
      },
    };

    console.log('Post record:', JSON.stringify(postRecord, null, 2));
    const postRes = await agent.post(postRecord);

    const response = {
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
    console.info('bluesky video finalize succeeded', response.body);
    return response;
  } catch (error) {
    console.error('bluesky_video_finalize -> error:', error);
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
