# Implementation Tasks

## 1. インフラ準備（Cloudflare D1）

- [x] 1.1 Cloudflare D1 データベースを作成し、`sns_credentials(session_id, sns_type, enc_token, meta, updated_at, PRIMARY KEY(session_id, sns_type))` と `pr_ghost_state(session_id PRIMARY KEY, enabled, interval_hours, texts, last_posted_at, rotation_index)` を作成する（DDL は `backend/d1/schema.sql`。手動適用済み）
- [x] 1.2 Netlify 環境変数に `CF_ACCOUNT_ID` / `CF_D1_DATABASE_ID` / `CF_API_TOKEN` を追加する（`.env.example` も更新）※ 手動設定済み

## 2. バックエンド共通ユーティリティ

- [x] 2.1 D1 HTTP API クライアント（`POST /accounts/{account_id}/d1/database/{database_id}/query`）を新設する
- [x] 2.2 AES 暗号化ユーティリティを新設する（`PPPOST_DATA_SECRET`、レコードごとランダム IV、`iv:ciphertext` hex 形式で保存/復元）
- [x] 2.3 セッション発行（`crypto.randomBytes` で不透明 ID 生成）と検証（`Authorization: Bearer` → D1 レコード照合）の共通処理を新設する
- [x] 2.4 セッション×SNS のトークン保存/取得/削除の共通関数を新設する（保存は暗号化、取得は復号）
- [x] 2.5 切断要求で該当セッション×SNS の保管トークンのみを D1 から削除するエンドポイント/経路を用意する（他 SNS のトークンは保持。Threads/Mastodon/Bluesky 共通）

## 3. Threads（発行側・消費側）

- [x] 3.1 `threads_token.js`: 交換した長命トークンを**返さず D1 保存**し、セッション ID と `user_id` 等メタのみ返す
- [x] 3.2 `threads_post.js` / `threads_posts.js`: クライアントからの token 受領を廃止し、セッションから復号トークンを引いて使用
- [x] 3.3 `threads_refresh.js`: リフレッシュ判定・実行をサーバー側に集約し、D1 のトークンと更新時刻を更新（新トークンは返さない）

## 4. Mastodon（発行側・消費側）

- [x] 4.1 `mastodon_token.js`: access_token を返さず D1 保存し、セッション ID とメタのみ返す
- [x] 4.2 `mastodon_post.js` / `mastodon_posts.js`: セッションから復号トークンを引いて使用（既存の未使用 `decrypt()` は共通ユーティリティへ統合）

## 5. Bluesky（発行側・消費側）

- [x] 5.1 `bluesky_login.js`: `agent.session` を返さず D1 保存し、セッション ID と表示用（handle/did）のみ返す
- [x] 5.2 `bluesky_post.js` / `bluesky_posts.js`: セッションから復号 session を引いて `resumeSession`。`refreshSession` の更新結果は D1 に書き戻す（クライアントへは返さない）

## 6. ゴースト投稿間隔のサーバー移管（PPP-013）

- [x] 6.1 PR 設定（有効/間隔/文リスト）と実行状態（`last_posted_at`/`rotation_index`）を D1 `pr_ghost_state` に保存する API を用意する
- [x] 6.2 PR ゴースト投稿の間隔判定・ローテーション・成功時のみ状態更新を**サーバー側**で実施する
- [x] 6.3 クライアント（`localStorage`）での間隔判定・状態保持を廃止する

## 7. フロントエンド

- [x] 7.1 `func.ts`: `ppp_setting_*` からトークン項目を除去（接続有無＋表示メタのみ）、`ppp_session_id` の save/load を追加
- [x] 7.2 `MainContent.ts`: 各 `postToXxx`・`loadMyPostsXxx` から token 送信を廃止し、`Authorization: Bearer <session_id>` を付与
- [x] 7.3 各 `*Connection.svelte`: 接続完了時にトークンを受け取らず、セッション ID とメタで接続状態を表現（Threads redirect 着地後の処理見直し含む）
- [x] 7.4 PR ゴースト投稿設定 UI をサーバー保存（D1）に接続する

## 8. 移行・後始末

- [x] 8.1 旧 `localStorage` のトークン項目を破棄し、未接続として扱う（再接続を促す）
- [x] 8.2 不要になったクライアント側トークン型・関数を整理する

## 9. 動作検証

- [x] 9.1 `cd frontend && npm run build` が型エラーなく成功する
- [ ] 9.2 接続・投稿後、`localStorage` とネットワーク応答に SNS トークンが一切現れない（現れるのは session_id のみ）ことを DevTools で確認
- [ ] 9.3 Threads/Mastodon/Bluesky の投稿・自投稿取得が D1 保管トークンで成立する
- [ ] 9.4 Threads の長命トークンリフレッシュがサーバー側で成立する
- [ ] 9.5 ゴースト投稿間隔がサーバー判定で効き、`localStorage` 改変で回避できないことを確認
- [x] 9.6 D1 HTTP API の疎通・エラーハンドリング（CF 側障害時に投稿が安全に失敗する）を確認（疎通・テーブル存在は確認済み。障害時挙動は実機検証時に確認）
- [ ] 9.7 切断で当該 SNS の保管トークンのみが D1 から削除され、同一セッションの他 SNS のトークンが保持されることを確認（切断後は当該 SNS が未接続として扱われること）
