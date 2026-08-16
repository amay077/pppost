const fetch = require('node-fetch');
const { extractSessionId } = require('../lib/session');
const { getToken } = require('../lib/token-store');
const {
  THREADS_API_BASE,
  OVERALL_BUDGET_MS,
  publishContainer,
  doThreadsPost,
  tryPostPrGhost,
} = require('../lib/threads');

// threads_post で作成された動画コンテナの処理完了を待ち、公開する最終化エンドポイント。
// 動画コンテナの処理（FINISHED 化）は Meta 側で数十秒かかることがあり、
// 同期 Function の実行時間制限（10 秒）内に収まらないため、2 段階に分けている。
// クライアントは本エンドポイントを 202 が返る間ポーリングし、200 で完了する。

const errorResponse = (statusCode, error) => ({
  statusCode,
  headers: {
    'Access-Control-Allow-Origin': '*',
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({ error }),
});

const handler = async (event) => {
  const deadline = Date.now() + OVERALL_BUDGET_MS;

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

    const stored = await getToken(sessionId, 'threads');
    if (stored == null) {
      return errorResponse(400, 'threads token not stored');
    }
    const token = stored.token.access_token;

    const { creation_id, text, video_url } = JSON.parse(event.body);
    if (typeof creation_id !== 'string' || creation_id.length === 0) {
      return errorResponse(400, 'creation_id required');
    }
    const videoUrl = (typeof video_url === 'string' && video_url.length > 0) ? video_url : null;

    // コンテナの処理状態を確認する
    const statusUrl = `${THREADS_API_BASE}/${encodeURIComponent(creation_id)}`
      + `?fields=status,error_message&access_token=${encodeURIComponent(token)}`;
    const statusRes = await fetch(statusUrl);
    if (!statusRes.ok) {
      console.error(`threads container status check failed: ${statusRes.status}`, await statusRes.text());
      return errorResponse(500, 'failed to check threads container status');
    }
    const statusJson = await statusRes.json();
    const status = statusJson.status;

    if (status === 'ERROR' || status === 'EXPIRED') {
      console.error(`threads video container not publishable: status=${status}`, statusJson.error_message);
      return errorResponse(400, `threads video container failed: ${status}`);
    }
    if (status !== 'FINISHED') {
      // まだ処理中: クライアントに再ポーリングを促す
      return {
        statusCode: 202,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ status: 'processing', creation_id }),
      };
    }

    // 公開（一時エラー 4279009 の場合は、本文・動画 URL を使ってコンテナを作り直して再投稿する）
    // コンテナ再作成には投稿内容が必要なため、クライアントから渡された text / video_url を使用する
    let published = await publishContainer(creation_id, token);
    if (!published.ok && published.retryable === true) {
      if (videoUrl == null) {
        return errorResponse(500, 'failed to publish threads');
      }
      const retryResult = await doThreadsPost({
        token,
        text: text ?? '',
        imageUrls: [],
        videoUrl,
        reply_to_id: '',
        quote_to_id: '',
        isGhost: false,
        deadline,
      });
      if (!retryResult.ok) {
        return errorResponse(retryResult.statusCode, retryResult.error);
      }
      published = retryResult;
    }
    if (!published.ok) {
      return errorResponse(500, 'failed to publish threads');
    }

    // 公開が成功したときのみ PR ゴースト投稿を試行する
    await tryPostPrGhost(stored.meta.user_id, token, deadline);

    const response = {
      statusCode: 200,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({}),
    };
    console.info('threads video finalize succeeded', response.body);
    return response;
  } catch (error) {
    console.log(`threads_video_finalize -> error:`, error);
    return { statusCode: 500, body: JSON.stringify({ error: error.message }) }
  }
};

module.exports = { handler }
