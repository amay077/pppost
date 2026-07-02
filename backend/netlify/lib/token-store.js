const { query } = require('./d1');
const { encrypt, decrypt } = require('./crypto');

// セッション×SNS のトークンを暗号化して保存（UPSERT）。meta は表示用情報の JSON 化。
const saveToken = async (sessionId, snsType, tokenObj, meta) => {
  const encToken = encrypt(JSON.stringify(tokenObj));
  const metaJson = JSON.stringify(meta);
  const updatedAt = Date.now();
  await query(
    `INSERT INTO sns_credentials (session_id, sns_type, enc_token, meta, updated_at)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(session_id, sns_type) DO UPDATE SET
       enc_token = excluded.enc_token,
       meta = excluded.meta,
       updated_at = excluded.updated_at`,
    [sessionId, snsType, encToken, metaJson, updatedAt]
  );
};

// セッション×SNS のトークンを復号して返す。無ければ null。
const getToken = async (sessionId, snsType) => {
  const rows = await query(
    `SELECT enc_token, meta, updated_at FROM sns_credentials WHERE session_id = ? AND sns_type = ?`,
    [sessionId, snsType]
  );
  if (rows == null || rows.length === 0) return null;
  const row = rows[0];
  return {
    token: JSON.parse(decrypt(row.enc_token)),
    meta: JSON.parse(row.meta),
    updatedAt: row.updated_at,
  };
};

// セッション×SNS の保管トークンのみを削除する（他 SNS の行は残す）。
const deleteToken = async (sessionId, snsType) => {
  await query(
    `DELETE FROM sns_credentials WHERE session_id = ? AND sns_type = ?`,
    [sessionId, snsType]
  );
};

// セッションに紐づく保管レコードが 1 件でも存在するかを返す。
const sessionExists = async (sessionId) => {
  const rows = await query(
    `SELECT 1 FROM sns_credentials WHERE session_id = ? LIMIT 1`,
    [sessionId]
  );
  return rows != null && rows.length > 0;
};

module.exports = { saveToken, getToken, deleteToken, sessionExists };
