# Bluesky 接続の OAuth 化

## Why

現行の Bluesky 接続は ID/パスワード（アプリパスワード）によるログイン（`bluesky_login`）だが、Bluesky は AT Protocol OAuth（authorization code + PKCE + DPoP）への移行を進めており、パスワード方式は廃止される方向にある。OAuth 対応が必要（Issue #18）。

## What Changes

- バックエンドで **OAuth 認可フロー（authorization code + PKCE + DPoP）** を処理する（[@atproto/oauth-client-node](https://github.com/bluesky-social/atproto/tree/main/packages/oauth/oauth-client-node) を使用）
- **クライアント metadata と JWKS** を公開する（`client_id` は metadata の公開 URL。Bluesky OAuth は全クライアントに metadata 公開が必須）
- `redirect_uri` はバックエンドのコールバックエンドポイント（例: `https://{api_domain}/bluesky_oauth_callback`）とする
- OAuth の一時状態（認可フロー中の PKCE verifier・state・DPoP 鍵）は **D1 に短命保管**し、認可後のトークン（OAuth セッション）は既存の `token-store`（D1 暗号化保管）へ保存する（`credential-custody` に従う。クライアントにはセッション ID と表示用メタのみ返す）
- 投稿・自投稿取得は、保管した OAuth セッションを復元（`restore`）して実行する。アクセストークンの期限切れはバックエンドが自動リフレッシュする
- フロント UI を「ID/パスワード入力」から「**ハンドル入力 + OAuth 認可ボタン（別タブで認可 → 完了確認）**」へ変更する
- パスワードログイン（`bluesky_login` エンドポイント）を廃止する

### 実施順序の注記

本 change は **PPP-027（Netlify Functions → Cloudflare Workers 移管）の完了後に実施する**。バックエンド実装は Workers 上で行い、`@atproto/oauth-client-node` の Workers 互換性は実装着手時に検証する（PPP-027 のタスク 3.6 と同様の検証フロー。動かない場合はバージョン更新、それでも駄目なら XRPC 直叩きへ切替）。クライアント metadata の `redirect_uris` は Workers の URL を基準に設定する。

## Impact

- **Affected specs**: `bluesky-oauth`（新規 capability）
- **Affected code**:
  - バックエンド（PPP-027 移管後の `backend/worker/`）: `bluesky_login` 相当（廃止）→ `bluesky_oauth_start` / `bluesky_oauth_callback` / `bluesky_oauth_confirm` ルート（新規）、`bluesky_post` / `bluesky_posts` ルート（OAuth セッション利用へ変更）、`lib/`（stateStore / sessionStore の D1 実装）
  - フロントエンド: `frontend/src/lib/BlueskyConnection.svelte`（OAuth UI 化）
- **Breaking changes**: パスワードログインの廃止。接続済みユーザーの既存セッションは有効期間中は継続利用でき、期限切れ後は OAuth での再接続が必要
- **Open questions**:
  - `@atproto/oauth-client-node` の Cloudflare Workers での動作は実装着手時に検証する
  - クライアント metadata の `redirect_uris` は API ドメインに依存するため、Workers の URL 確定後に設定する

## References

- [Issue #18](https://github.com/amay077/pppost/issues/18) - Bluesky 接続を OAuth にする
- [oauth-client-node README](https://github.com/bluesky-social/atproto/tree/main/packages/oauth/oauth-client-node)
- [OAuth Client Implementation（atproto docs）](https://docs.bsky.app/docs/advanced-guides/oauth-client)
