const fetch = require('node-fetch')
const { extractSessionId } = require('../lib/session');
const { getToken, saveToken } = require('../lib/token-store');

// 取得（最終更新）から 24 時間以上経過している場合のみリフレッシュする
const REFRESH_THRESHOLD_MS = 24 * 60 * 60 * 1000;

const handler = async (event) => {
  console.log(`start handler - `, event);

  // CORS対応
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        'Access-Control-Allow-Methods': 'GET, OPTIONS',
      },
      body: '',
    };
  }

  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Content-Type': 'application/json',
  };

  try {
    const sessionId = extractSessionId(event);
    if (sessionId == null) {
      return { statusCode: 401, headers, body: JSON.stringify({ error: 'session required' }) };
    }

    const stored = await getToken(sessionId, 'threads');
    if (stored == null) {
      // 保管されていなければリフレッシュ対象なし（no-op）
      return { statusCode: 200, headers, body: JSON.stringify({ refreshed: false }) };
    }

    // 24 時間未満はリフレッシュしない（Threads API の制約）
    if (Date.now() - stored.updatedAt < REFRESH_THRESHOLD_MS) {
      return { statusCode: 200, headers, body: JSON.stringify({ refreshed: false }) };
    }

    const token = stored.token.access_token;

    // 長命トークン（60 日）をリフレッシュ（client_secret 不要）
    const refreshRes = await fetch(`https://graph.threads.net/refresh_access_token?grant_type=th_refresh_token&access_token=${token}`);

    if (!refreshRes.ok) {
      // リフレッシュ失敗時は既存の保管トークンと接続状態を維持する
      console.error(`refresh token request failed: ${refreshRes.status}`, await refreshRes.text());
      return { statusCode: 200, headers, body: JSON.stringify({ refreshed: false }) };
    }

    const refreshJson = await refreshRes.json();

    // 新トークンと更新時刻を D1 に保存（クライアントへはトークンを返さない）
    await saveToken(sessionId, 'threads', {
      access_token: refreshJson.access_token,
      token_type: refreshJson.token_type,
      expires_in: refreshJson.expires_in,
    }, stored.meta);

    const response = {
      statusCode: 200,
      headers,
      body: JSON.stringify({ refreshed: true })
    };
    console.log(`finish handler - `, response);

    return response;

  } catch (error) {
    console.log(`failed to refresh token:`, error);
    return { statusCode: 500, body: error.toString() }
  }
}

module.exports = { handler }
