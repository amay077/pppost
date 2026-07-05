const { extractSessionId } = require('../lib/session');
const { getToken } = require('../lib/token-store');
const { getPrGhostState, savePrGhostSetting } = require('../lib/pr-ghost');

const DEFAULT_INTERVAL_HOURS = 48;

const handler = async (event) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'GET, PUT, OPTIONS',
  };

  // CORS対応
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  try {
    const sessionId = extractSessionId(event);
    if (sessionId == null) {
      return { statusCode: 401, headers, body: JSON.stringify({ error: 'session required' }) };
    }

    // PR 設定は Threads アカウント（user_id）単位で管理するため、
    // セッションに Threads トークンが保管されていることを要求し、meta から user_id を解決する
    const stored = await getToken(sessionId, 'threads');
    if (stored == null) {
      return { statusCode: 400, headers, body: JSON.stringify({ error: 'threads token not stored' }) };
    }
    const threadsUserId = stored.meta.user_id;

    if (event.httpMethod === 'GET') {
      const state = await getPrGhostState(threadsUserId);
      const setting = state != null
        ? { enabled: state.enabled, intervalHours: state.intervalHours, texts: state.texts }
        : { enabled: false, intervalHours: DEFAULT_INTERVAL_HOURS, texts: [''] };
      return { statusCode: 200, headers, body: JSON.stringify(setting) };
    }

    if (event.httpMethod === 'PUT') {
      const { enabled, intervalHours, texts } = JSON.parse(event.body);
      await savePrGhostSetting(threadsUserId, {
        enabled: enabled === true,
        intervalHours: typeof intervalHours === 'number' ? intervalHours : DEFAULT_INTERVAL_HOURS,
        texts: Array.isArray(texts) ? texts : [],
      });
      return { statusCode: 200, headers, body: JSON.stringify({}) };
    }

    return { statusCode: 405, headers, body: JSON.stringify({ error: 'method not allowed' }) };
  } catch (error) {
    console.error(`pr_ghost_setting -> error:`, error);
    return { statusCode: 500, headers, body: error.toString() };
  }
};

module.exports = { handler };
