const fetch = require('node-fetch')

const THREADS_API_BASE = 'https://graph.threads.net/v1.0';
const MAX_IMAGES = 10;

const errorResponse = (statusCode, error) => ({
  statusCode,
  headers: {
    'Access-Control-Allow-Origin': '*',
  },
  body: JSON.stringify({ error }),
});

// メディアコンテナを作成し creation_id を返す。失敗時は null を返す
const createContainer = async (params) => {
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
    console.error(`threads container creation failed: ${res.status}`, await res.text());
    return null;
  }

  const json = await res.json();
  return json.id;
};

// コンテナの処理完了（status=FINISHED）を待つ。完了時 true、失敗/タイムアウト時 false
// Threads のメディアコンテナは非同期処理されるため、publish 前に FINISHED を待たないと
// "Media Not Found"（code:24 / subcode:4279009）になる
const waitForContainerReady = async (creation_id, token) => {
  // Netlify 同期 Function の既定 10 秒タイムアウトに収める（1 秒間隔 × 最大 6 回）
  const MAX_ATTEMPTS = 6;
  const INTERVAL_MS = 1000;

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
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

    // IN_PROGRESS など: 次回チェックまで待機（最終試行後は待たない）
    if (attempt < MAX_ATTEMPTS - 1) {
      await new Promise((resolve) => setTimeout(resolve, INTERVAL_MS));
    }
  }

  console.error(`threads container not ready after ${MAX_ATTEMPTS} attempts: ${creation_id}`);
  return false;
};

// creation_id を公開する。成功時 true、失敗時 false
const publishContainer = async (creation_id, token) => {
  const res = await fetch(`${THREADS_API_BASE}/me/threads_publish`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: `creation_id=${encodeURIComponent(creation_id)}&access_token=${encodeURIComponent(token)}`,
  });

  if (!res.ok) {
    console.error(`threads publish failed: ${res.status}`, await res.text());
    return false;
  }

  return true;
};

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
    const { user_id, token, text, images, reply_to_id } = JSON.parse(event.body);
    const imageUrls = Array.isArray(images) ? images : [];

    // リプライ投稿時のみトップレベルコンテナに付与する追加パラメータ
    const replyParams = (reply_to_id != null && reply_to_id !== '')
      ? { reply_to_id }
      : {};

    // 上限超過: Threads API を呼ばずにエラーを返す
    if (imageUrls.length > MAX_IMAGES) {
      console.error(`threads image count exceeds maximum: ${imageUrls.length}`);
      return errorResponse(400, 'image count exceeds maximum (10)');
    }

    let creation_id;

    if (imageUrls.length === 0) {
      // テキストのみ投稿（media_type=TEXT）
      creation_id = await createContainer({
        media_type: 'TEXT',
        text,
        access_token: token,
        ...replyParams,
      });
      if (creation_id == null) {
        return errorResponse(500, 'failed to create threads container');
      }
    } else if (imageUrls.length === 1) {
      // 単画像投稿（media_type=IMAGE）
      creation_id = await createContainer({
        media_type: 'IMAGE',
        image_url: imageUrls[0],
        text,
        access_token: token,
        ...replyParams,
      });
      if (creation_id == null) {
        return errorResponse(500, 'failed to create threads container');
      }
    } else {
      // カルーセル投稿（media_type=CAROUSEL）
      // 子コンテナを並列作成
      const childIds = await Promise.all(
        imageUrls.map((image_url) =>
          createContainer({
            media_type: 'IMAGE',
            image_url,
            access_token: token,
          })
        )
      );

      // 子コンテナのいずれか 1 つでも失敗した場合は投稿全体を失敗とする
      if (childIds.some((id) => id == null)) {
        return errorResponse(500, 'failed to create threads child container');
      }

      // 親コンテナを作成
      creation_id = await createContainer({
        media_type: 'CAROUSEL',
        children: childIds.join(','),
        text,
        access_token: token,
        ...replyParams,
      });
      if (creation_id == null) {
        return errorResponse(500, 'failed to create threads carousel container');
      }
    }

    // 公開前にコンテナの処理完了（status=FINISHED）を待つ
    const ready = await waitForContainerReady(creation_id, token);
    if (!ready) {
      return errorResponse(500, 'threads container not ready');
    }

    // 公開
    const published = await publishContainer(creation_id, token);
    if (!published) {
      return errorResponse(500, 'failed to publish threads');
    }

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
