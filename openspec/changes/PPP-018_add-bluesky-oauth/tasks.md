# Implementation Tasks

**前提**: PPP-027（Workers 移管）が完了している。実装対象は `backend/worker/`（TypeScript / Hono）とする。

## 1. バックエンド: oauth-client-node の導入と公開ルート

- [ ] 1.1 `@atproto/oauth-client-node`（および必要な @atproto/jwk-jose 等）を `backend/worker/package.json` に追加する
- [ ] 1.2 OAuth 用の秘密鍵（JWKS）を生成し、`PPPOST_BSKY_OAUTH_PRIVATE_KEY`（等）として wrangler の secrets / vars へ登録する（`backend/.env.example` にも追記）
- [ ] 1.3 クライアント metadata と JWKS を返す公開ルートを実装する（例: `GET /bluesky_oauth_client_metadata` / `GET /bluesky_oauth_jwks`。`client_id` は metadata の URL、`redirect_uris` は Workers の URL 上のコールバック URL）
- [ ] 1.4 `NodeOAuthClient` の初期化（clientMetadata / keyset / stateStore / sessionStore / requestLock）を行う共有モジュール `src/lib/bluesky-oauth.ts` を作成する

## 2. バックエンド: 状態ストアの D1 実装

- [ ] 2.1 stateStore（認可フロー中の一時状態: PKCE verifier・state）を D1 に短命保存（有効期限 10 分程度）で実装する
- [ ] 2.2 sessionStore を既存 `token-store`（D1 `sns_credentials`、AES 暗号化）を利用して実装する

## 3. バックエンド: OAuth フローの API

- [ ] 3.1 `POST /bluesky_oauth_start`（ハンドル + セッション ID を受け、`client.authorize(handle)` で認可 URL を返す）を実装する
- [ ] 3.2 `GET /bluesky_oauth_callback`（`client.callback(params)` でコード交換し、結果を一時保存）を実装する
- [ ] 3.3 `POST /bluesky_oauth_confirm`（接続完了指示。OAuth セッションを token-store へ保管し、セッション ID + 表示用メタ（handle / did）を返す）を実装する

## 4. バックエンド: 投稿・自投稿取得の OAuth 利用

- [ ] 4.1 `bluesky_post` ルートを、保管した OAuth セッションを `client.restore(did)` で復元して投稿する方式へ変更する（resumeSession / refreshSession を廃止）
- [ ] 4.2 `bluesky_posts` ルートを同様に OAuth セッション利用へ変更する
- [ ] 4.3 アクセストークン期限切れ時の自動リフレッシュが動作し、更新セッションが D1 に保存されることを確認する

## 5. フロントエンド: 接続 UI の OAuth 化

- [ ] 5.1 `frontend/src/lib/BlueskyConnection.svelte` を「ハンドル入力 + OAuth 接続ボタン（別タブで認可）→ 接続完了ボタン」の UI へ変更する（ID/パスワード入力欄を削除）
- [ ] 5.2 接続成功時にセッション ID と表示用メタを保存し、接続済み表示・切断が従来どおり動作することを確認する

## 6. パスワードログインの廃止

- [ ] 6.1 `bluesky_login` ルート（Workers 移管後の相当実装）を削除する
- [ ] 6.2 パスワードログインへの参照が残っていないことを確認する（grep）

## 7. 検証

- [ ] 7.1 `tsc --noEmit` で型チェックが通る
- [ ] 7.2 `npm run check` / `npm run build`（frontend）が成功する（既存エラー 3 件のみ）
- [ ] 7.3 実機確認: OAuth で Bluesky に接続できる（別タブの認可 → 接続完了）
- [ ] 7.4 実機確認: 接続後にテキスト・画像投稿と自投稿取得ができる
- [ ] 7.5 実機確認: アクセストークン期限切れ後の投稿で自動リフレッシュが動作する
- [ ] 7.6 実機確認: パスワードログイン時代の保管セッションで再接続なしに投稿できる（有効期間中）
- [ ] 7.7 実機確認: 認可前に接続完了を指示すると失敗が通知される
