const crypto = require('crypto');

// 高エントロピーな不透明セッション ID を発行する
const generateSessionId = () => crypto.randomBytes(32).toString('hex');

// `Authorization: Bearer <session_id>` ヘッダからセッション ID を取り出す。無ければ null。
// Netlify Functions はヘッダ名を小文字化するが、念のため両方を見る。
const extractSessionId = (event) => {
  const headers = event.headers ?? {};
  const auth = headers['authorization'] ?? headers['Authorization'];
  if (auth == null) return null;
  const matched = /^Bearer\s+(.+)$/.exec(auth);
  return matched != null ? matched[1] : null;
};

module.exports = { generateSessionId, extractSessionId };
