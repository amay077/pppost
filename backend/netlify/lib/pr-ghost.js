const { query } = require('./d1');

// PR ゴースト投稿の設定＋実行状態を返す。未作成なら null。
// キーは Threads アカウント（user_id）。セッション（ブラウザ）をまたいで同一アカウントなら状態を共有する。
const getPrGhostState = async (threadsUserId) => {
  const rows = await query(
    `SELECT enabled, interval_hours, texts, last_posted_at, rotation_index
     FROM pr_ghost_state WHERE threads_user_id = ?`,
    [threadsUserId]
  );
  if (rows == null || rows.length === 0) return null;
  const row = rows[0];
  return {
    enabled: row.enabled === 1 || row.enabled === true,
    intervalHours: row.interval_hours,
    texts: JSON.parse(row.texts),
    lastPostedAt: row.last_posted_at,
    rotationIndex: row.rotation_index,
  };
};

// 設定（有効/間隔/文リスト）を UPSERT する。実行状態は初回作成時のみ初期化し、更新時は保持する。
const savePrGhostSetting = async (threadsUserId, { enabled, intervalHours, texts }) => {
  await query(
    `INSERT INTO pr_ghost_state (threads_user_id, enabled, interval_hours, texts, last_posted_at, rotation_index)
     VALUES (?, ?, ?, ?, NULL, 0)
     ON CONFLICT(threads_user_id) DO UPDATE SET
       enabled = excluded.enabled,
       interval_hours = excluded.interval_hours,
       texts = excluded.texts`,
    [threadsUserId, enabled === true ? 1 : 0, intervalHours, JSON.stringify(texts)]
  );
};

// 実行状態（前回投稿時刻・ローテーション位置）を更新する。
const updatePrGhostExecState = async (threadsUserId, lastPostedAt, rotationIndex) => {
  await query(
    `UPDATE pr_ghost_state SET last_posted_at = ?, rotation_index = ? WHERE threads_user_id = ?`,
    [lastPostedAt, rotationIndex, threadsUserId]
  );
};

module.exports = { getPrGhostState, savePrGhostSetting, updatePrGhostExecState };
