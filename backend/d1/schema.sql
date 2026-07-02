-- Cloudflare D1 スキーマ（PPP-014: 投稿トークンのサーバー側保管）
--
-- 適用方法:
--   npx wrangler d1 execute pppost --remote --file backend/d1/schema.sql
-- または Cloudflare ダッシュボードの D1 Console で実行する。

-- セッション×SNS ごとの暗号化トークン保管庫
-- enc_token は AES-256-CBC（レコードごとランダム IV、`iv:cipher` hex 形式）
CREATE TABLE IF NOT EXISTS sns_credentials (
  session_id TEXT NOT NULL,
  sns_type   TEXT NOT NULL,
  enc_token  TEXT NOT NULL,
  meta       TEXT,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (session_id, sns_type)
);

-- PR ゴースト投稿の設定＋実行状態（間隔判定はサーバー側で行う）
CREATE TABLE IF NOT EXISTS pr_ghost_state (
  session_id     TEXT PRIMARY KEY,
  enabled        INTEGER NOT NULL DEFAULT 0,
  interval_hours INTEGER NOT NULL DEFAULT 48,
  texts          TEXT,
  last_posted_at INTEGER,
  rotation_index INTEGER NOT NULL DEFAULT 0
);
