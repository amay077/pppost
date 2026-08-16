const { extractSessionId } = require('../lib/session');
const { getToken } = require('../lib/token-store');
const { OVERALL_BUDGET_MS, doThreadsPost, tryPostPrGhost } = require('../lib/threads');

const errorResponse = (statusCode, error, extra = {}) => ({
  statusCode,
  headers: {
    'Access-Control-Allow-Origin': '*',
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({ error, ...extra }),
});

const handler = async (event) => {
  // Netlify 同期 Function の実行時間制限に収めるための全体予算（本投稿と PR ゴースト投稿で共有する）
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

    const { text, images, video, reply_to_id, quote_to_id } = JSON.parse(event.body);
    const imageUrls = Array.isArray(images) ? images : [];
    const videoUrl = (typeof video === 'string' && video.length > 0) ? video : null;

    // 動画と画像の併用は不可（フロントでも排他制御するが、サーバー側でも拒否する）
    if (videoUrl != null && imageUrls.length > 0) {
      return errorResponse(400, 'cannot post video with images');
    }
    // 動画とリプライ・引用の併用は不可
    if (videoUrl != null && ((reply_to_id != null && reply_to_id !== '') || (quote_to_id != null && quote_to_id !== ''))) {
      return errorResponse(400, 'cannot post video with reply or quote');
    }

    // 本投稿
    const result = await doThreadsPost({ token, text, imageUrls, videoUrl, reply_to_id, quote_to_id, isGhost: false, deadline });
    if (!result.ok) {
      // 動画コンテナが予算内に処理完了しなかった場合: 失敗とせず 202 を返し、
      // クライアントに threads_video_finalize での後続処理（処理完了待ち → 公開）を促す
      if (result.statusCode === 202) {
        const response = {
          statusCode: 202,
          headers: {
            'Access-Control-Allow-Origin': '*',
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ status: 'processing', creation_id: result.creationId }),
        };
        console.info('threads video container created, waiting for finalize', response.body);
        return response;
      }
      return errorResponse(result.statusCode, result.error);
    }

    // 本投稿が成功したときのみ PR ゴースト投稿を試行する（失敗は本投稿に影響させない）
    await tryPostPrGhost(stored.meta.user_id, token, deadline);

    const response = {
      statusCode: 200,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({})
    };
    console.info('post threads succeeded', response);
    return response;
  } catch (error) {
    console.log(`handler -> error:`, error);
    return errorResponse(500, error.message)
  }
}

module.exports = { handler }
