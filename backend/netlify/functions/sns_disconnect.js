const { extractSessionId } = require('../lib/session');
const { deleteToken } = require('../lib/token-store');

const SNS_TYPES = ['threads', 'mastodon', 'bluesky'];

const handler = async (event) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
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

    const { sns_type } = JSON.parse(event.body);
    if (!SNS_TYPES.includes(sns_type)) {
      return { statusCode: 400, headers, body: JSON.stringify({ error: 'invalid sns_type' }) };
    }

    // 該当セッション × 当該 SNS の保管トークンのみを削除（他 SNS の行は残す）
    await deleteToken(sessionId, sns_type);

    return { statusCode: 200, headers, body: JSON.stringify({}) };
  } catch (error) {
    console.error(`sns_disconnect -> error:`, error);
    return { statusCode: 500, headers, body: error.toString() };
  }
};

module.exports = { handler };
