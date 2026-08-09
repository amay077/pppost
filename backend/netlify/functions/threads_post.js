const fetch = require('node-fetch')
const { extractSessionId } = require('../lib/session');
const { getToken } = require('../lib/token-store');
const { getPrGhostState, updatePrGhostExecState } = require('../lib/pr-ghost');

const THREADS_API_BASE = 'https://graph.threads.net/v1.0';
const MAX_IMAGES = 10;

// Netlify 同期 Function の実行時間制限（10 秒）に対する全体予算。
// 1 回の呼び出し（本投稿 + PR ゴースト投稿）でこの予算を使い切る。
const OVERALL_BUDGET_MS = 8500;
// カルーセル子コンテナの完了待ちに割り当てる上限（親作成・親待ち・公開の分を残す）
const CHILD_WAIT_BUDGET_MS = 5000;
// PR ゴースト投稿を試行するために必要な残り時間
const GHOST_MIN_BUDGET_MS = 2000;
// コンテナ状態のポーリング間隔
const POLL_INTERVAL_MS = 500;
// 公開（threads_publish）の最大試行回数（初回 + コンテナ再作成リトライ 2 回）
const MAX_PUBLISH_ATTEMPTS = 3;
// 公開のコンテナ再作成リトライを試行するために必要な残り時間
const RETRY_MIN_BUDGET_MS = 2000;

const errorResponse = (statusCode, error) => ({
  statusCode,
  headers: {
    'Access-Control-Allow-Origin': '*',
  },
  body: JSON.stringify({ error }),
});

// メディアコンテナを作成し creation_id を返す。失敗時は null を返す
// label は失敗時のログで作成段階（text / image / carousel-item / carousel / ghost）を識別するために使う
const createContainer = async (params, label) => {
  const body = Object.entries(params)
    .map(([k, v]) => `${k}=${encodeURIComponent(v)}`)
    .join('&');

  const res = await fetch(`${THREADS_API_BASE}/me/threads`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body,
  });

  if (!res.ok) {
    console.error(`threads container creation failed [${label}]: ${res.status}`, await res.text());
    return null;
  }

  const json = await res.json();
  return json.id;
};

// コンテナの処理完了（status=FINISHED）を待つ。完了時 true、失敗/予算切れ時 false
// Threads のメディアコンテナは非同期処理されるため、publish 前に FINISHED を待たないと
// "Media Not Found"（code:24 / subcode:4279009）になる。
// カルーセルでは親コンテナ作成前に各子コンテナの完了も待つ必要がある（待たないと
// "Invalid Carousel Children"（code:100 / subcode:4279004）になる）。
// deadline は絶対時刻（ミリ秒）。Netlify 同期 Function の実行時間制限に収めるため有限に打ち切る。
const waitForContainerReady = async (creation_id, token, deadline) => {
  // 予算が尽きていても状態確認は必ず 1 回行う（既に FINISHED なら公開できるため）
  for (;;) {
    const url = `${THREADS_API_BASE}/${encodeURIComponent(creation_id)}`
      + `?fields=status,error_message&access_token=${encodeURIComponent(token)}`;
    const res = await fetch(url);

    if (!res.ok) {
      console.error(`threads container status check failed: ${res.status}`, await res.text());
      return false;
    }

    const json = await res.json();
    const status = json.status;

    if (status === 'FINISHED') {
      return true;
    }
    if (status === 'ERROR' || status === 'EXPIRED') {
      console.error(`threads container not publishable: status=${status}`, json.error_message);
      return false;
    }

    // IN_PROGRESS など: 次回チェックが予算内に収まる場合のみ待機して再確認する
    if (Date.now() + POLL_INTERVAL_MS >= deadline) {
      break;
    }
    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
  }

  console.error(`threads container not ready within budget: ${creation_id}`);
  return false;
};

// 公開失敗時のエラーボディが再試行対象（code:24 / subcode:4279009 "Media Not Found"）か判定する
// status=FINISHED を確認済みでも、Meta 側の非同期伝播により公開がこのエラーで失敗することがある。
// is_transient:false を返すが、コミュニティの報告（fbsamples/threads_api#70 等）では
// コンテナを作り直しての再試行で成功するため、このエラーのみ再試行対象とする。
const isTransientPublishError = (bodyText) => {
  try {
    const json = JSON.parse(bodyText);
    return json.error != null
      && json.error.code === 24
      && json.error.error_subcode === 4279009;
  } catch {
    return false;
  }
};

// creation_id を公開する。成功時 { ok: true }、失敗時 { ok: false, retryable }。
// retryable は上記の一時的失敗（4279009）で、コンテナを作り直して再試行すれば成功しうることを表す。
const publishContainer = async (creation_id, token) => {
  const res = await fetch(`${THREADS_API_BASE}/me/threads_publish`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: `creation_id=${encodeURIComponent(creation_id)}&access_token=${encodeURIComponent(token)}`,
  });

  if (!res.ok) {
    const bodyText = await res.text();
    console.error(`threads publish failed: ${res.status}`, bodyText);
    return { ok: false, retryable: isTransientPublishError(bodyText) };
  }

  return { ok: true };
};

// Threads へ 1 件投稿する。成功時 { ok: true }、失敗時 { ok: false, statusCode, error }。
// 公開が一時的失敗（code:24 / subcode:4279009）で失敗した場合のみ retryable: true を返す。
// isGhost=true のときはテキストのみ（media_type=TEXT）で is_ghost_post を付与し、画像・動画は無視する。
// videoUrl が指定された場合は media_type=VIDEO の単一動画コンテナを作成する（画像は併用不可）。
// deadline は絶対時刻（ミリ秒）で、この投稿に使える実行時間の上限を表す。
const doThreadsPostOnce = async ({ token, text, imageUrls, videoUrl, reply_to_id, quote_to_id, isGhost, deadline }) => {
  // リプライ投稿時のみトップレベルコンテナに付与する追加パラメータ
  const replyParams = (reply_to_id != null && reply_to_id !== '')
    ? { reply_to_id }
    : {};
  // 引用投稿時のみトップレベルコンテナに付与する追加パラメータ
  const quoteParams = (quote_to_id != null && quote_to_id !== '')
    ? { quote_post_id: quote_to_id }
    : {};

  let creation_id;

  if (isGhost === true) {
    creation_id = await createContainer({
      media_type: 'TEXT',
      text,
      is_ghost_post: true,
      access_token: token,
    }, 'ghost');
    if (creation_id == null) {
      return { ok: false, statusCode: 500, error: 'failed to create threads ghost container' };
    }
  } else if (videoUrl != null) {
    // 動画投稿（media_type=VIDEO）。video_url は公開 URL（R2 の公開 URL をそのまま渡す）
    creation_id = await createContainer({
      media_type: 'VIDEO',
      video_url: videoUrl,
      text,
      access_token: token,
      ...replyParams,
      ...quoteParams,
    }, 'video');
    if (creation_id == null) {
      return { ok: false, statusCode: 500, error: 'failed to create threads video container' };
    }
  } else {
    // 上限超過: Threads API を呼ばずにエラーを返す
    if (imageUrls.length > MAX_IMAGES) {
      console.error(`threads image count exceeds maximum: ${imageUrls.length}`);
      return { ok: false, statusCode: 400, error: 'image count exceeds maximum (10)' };
    }

    if (imageUrls.length === 0) {
      // テキストのみ投稿（media_type=TEXT）
      creation_id = await createContainer({
        media_type: 'TEXT',
        text,
        access_token: token,
        ...replyParams,
        ...quoteParams,
      }, 'text');
      if (creation_id == null) {
        return { ok: false, statusCode: 500, error: 'failed to create threads container' };
      }
    } else if (imageUrls.length === 1) {
      // 単画像投稿（media_type=IMAGE）
      creation_id = await createContainer({
        media_type: 'IMAGE',
        image_url: imageUrls[0],
        text,
        access_token: token,
        ...replyParams,
        ...quoteParams,
      }, 'image');
      if (creation_id == null) {
        return { ok: false, statusCode: 500, error: 'failed to create threads container' };
      }
    } else {
      // カルーセル投稿（media_type=CAROUSEL）
      // 子コンテナを並列作成。カルーセルの子であることを is_carousel_item=true で明示しないと
      // 親コンテナ作成時に "Invalid Carousel Children" となる
      const childIds = await Promise.all(
        imageUrls.map((image_url) =>
          createContainer({
            media_type: 'IMAGE',
            image_url,
            is_carousel_item: true,
            access_token: token,
          }, 'carousel-item')
        )
      );

      // 子コンテナのいずれか 1 つでも失敗した場合は投稿全体を失敗とする
      if (childIds.some((id) => id == null)) {
        return { ok: false, statusCode: 500, error: 'failed to create threads child container' };
      }

      // 親コンテナを作成する前に、すべての子コンテナの処理完了を待つ（並列に待つため
      // 所要時間は最も遅い子に依存する）。未完了の子を children に含めると
      // "Invalid Carousel Children" となる
      const childDeadline = Math.min(deadline, Date.now() + CHILD_WAIT_BUDGET_MS);
      const childrenReady = await Promise.all(
        childIds.map((id) => waitForContainerReady(id, token, childDeadline))
      );
      if (childrenReady.some((ready) => ready !== true)) {
        return { ok: false, statusCode: 500, error: 'threads child container not ready' };
      }

      // 親コンテナを作成
      creation_id = await createContainer({
        media_type: 'CAROUSEL',
        children: childIds.join(','),
        text,
        access_token: token,
        ...replyParams,
        ...quoteParams,
      }, 'carousel');
      if (creation_id == null) {
        return { ok: false, statusCode: 500, error: 'failed to create threads carousel container' };
      }
    }
  }

  // 公開前にコンテナの処理完了（status=FINISHED）を待つ
  const ready = await waitForContainerReady(creation_id, token, deadline);
  if (!ready) {
    return { ok: false, statusCode: 500, error: 'threads container not ready' };
  }

  // 公開
  const published = await publishContainer(creation_id, token);
  if (!published.ok) {
    return {
      ok: false,
      statusCode: 500,
      error: 'failed to publish threads',
      retryable: published.retryable === true,
    };
  }

  return { ok: true };
};

// Threads へ 1 件投稿する。成功時 { ok: true }、失敗時 { ok: false, statusCode, error }。
// 公開が code:24 / subcode:4279009 "Media Not Found" で失敗した場合は、Meta 側の非同期伝播による
// 一時的失敗として、実行時間予算が残る範囲でコンテナを作り直して再試行する（初回を含めて最大 3 回）。
// それ以外の失敗は 1 回で失敗とする。
// isGhost=true のときはテキストのみ（media_type=TEXT）で is_ghost_post を付与し、画像・動画は無視する。
// deadline は絶対時刻（ミリ秒）で、この投稿に使える実行時間の上限を表す。
const doThreadsPost = async ({ token, text, imageUrls, videoUrl, reply_to_id, quote_to_id, isGhost, deadline }) => {
  let lastResult;

  for (let attempt = 1; attempt <= MAX_PUBLISH_ATTEMPTS; attempt++) {
    // 2 回目以降はコンテナを作り直しての再試行。予算が残っていなければ試行せず失敗で打ち切る
    if (attempt > 1) {
      if (Date.now() + RETRY_MIN_BUDGET_MS >= deadline) {
        console.warn('threads publish retry skipped: insufficient time budget remaining');
        break;
      }
      console.warn(`threads publish failed transiently; retrying with a new container (attempt ${attempt}/${MAX_PUBLISH_ATTEMPTS})`);
    }

    lastResult = await doThreadsPostOnce({ token, text, imageUrls, videoUrl, reply_to_id, quote_to_id, isGhost, deadline });

    if (lastResult.ok || lastResult.retryable !== true) {
      break;
    }
  }

  return lastResult;
};

// PR ゴースト投稿を条件判定のうえサーバー側で実行する。
// 本投稿の成否には影響させず（例外・失敗は console のみ）、成功時のみ D1 の実行状態を更新する。
// 間隔状態のキーは Threads アカウント（user_id）。セッションをまたいでゲートを共有する。
// 本投稿で実行時間予算を使い切っている場合は試行しない（状態も更新しないため次回の本投稿で再試行される）。
const tryPostPrGhost = async (threadsUserId, token, deadline) => {
  try {
    if (deadline - Date.now() < GHOST_MIN_BUDGET_MS) {
      console.info('PR ghost post skipped: insufficient time budget remaining');
      return;
    }

    const state = await getPrGhostState(threadsUserId);
    if (state == null || state.enabled !== true) {
      return;
    }

    // 空文字・空白のみの PR 文は投稿対象から除外する
    const texts = state.texts.filter((t) => typeof t === 'string' && t.trim().length > 0);
    if (texts.length <= 0) {
      return;
    }

    // 間隔判定（実行状態が未作成、または前回投稿時刻が未設定なら経過済みとみなす）
    const elapsed = state.lastPostedAt == null
      || (Date.now() - state.lastPostedAt >= state.intervalHours * 3600_000);
    if (!elapsed) {
      return;
    }

    const index = state.rotationIndex % texts.length;
    const prText = texts[index];

    const result = await doThreadsPost({ token, text: prText, imageUrls: [], isGhost: true, deadline });
    if (result.ok) {
      await updatePrGhostExecState(threadsUserId, Date.now(), state.rotationIndex + 1);
    } else {
      console.error('PR ghost post failed; state not updated, will retry on next main post', result.error);
    }
  } catch (error) {
    console.error(`tryPostPrGhost -> error:`, error);
  }
};

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
      return errorResponse(result.statusCode, result.error);
    }

    // 本投稿が成功したときのみ PR ゴースト投稿を試行する（失敗は本投稿に影響させない）
    await tryPostPrGhost(stored.meta.user_id, token, deadline);

    const response = {
      statusCode: 200,
      headers: {
        'Access-Control-Allow-Origin': '*',
      },
      body: JSON.stringify({})
    };
    console.info('post threads succeeded', response);
    return response;
  } catch (error) {
    console.log(`handler -> error:`, error);
    return { statusCode: 500, body: error.toString() }
  }
}

module.exports = { handler }
