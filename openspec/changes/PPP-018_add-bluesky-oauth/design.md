# Design: Bluesky 接続の OAuth 化

## Context

- 現行の Bluesky 接続は `bluesky_login`（ID/パスワード）で `BskyAgent.login()` を呼び、session データを D1 に暗号化保管している（`credential-custody`）
- Bluesky（AT Protocol）は OAuth（authorization code + PKCE + DPoP）への移行を進めており、パスワード方式は廃止予定
- pppost の方針: トークンはクライアントに渡さずサーバー（D1）に暗号化保管。クライアントはセッション ID のみ保持
- **本 change は PPP-027（Netlify → Cloudflare Workers 移管）の完了後に実施し、バックエンドは Workers（`backend/worker/`、Hono）上で実装する**。このため、実装の前提は Workers ランタイムとし、Netlify Functions 向けの実装は行わない

## Goals / Non-Goals

- Goals:
  - Bluesky 接続を OAuth に一本化する
  - トークン・OAuth 状態をサーバー側（D1）で管理し、credential-custody 方針を維持する
  - 既存ユーザーはセッション有効期間中は再接続不要とする
- Non-Goals:
  - 他の SNS の接続方式変更
  - OAuth フローの自前実装（SDK を使用）

## Decisions

### D1: クライアント metadata と JWKS の公開

- バックエンド（Workers の Hono ルーター）に `client-metadata.json` と `jwks.json` を返すルート 2 本を設ける
- `client_id` は metadata の公開 URL（例: `https://{api_domain}/bluesky_oauth_client_metadata`）
- metadata の `redirect_uris` は Workers の URL 上のコールバック URL。URL は `[vars]` / 環境変数で集約する
- `token_endpoint_auth_method: private_key_jwt`（confidential client）。JWT 署名鍵（JWKS）はサーバー側で生成・保管し、シークレット（`PPPOST_BSKY_OAUTH_PRIVATE_KEY` 等）として環境変数に置く

### D2: OAuth フロー

1. フロントがハンドルを入力し「OAuth 接続」を押下 → `POST /bluesky_oauth_start`（ハンドル + 既存セッション ID）
2. バックエンドが `client.authorize(handle)` で認可 URL を生成（stateStore に一時状態を D1 保管）→ URL をフロントに返す
3. フロントが別タブで認可 URL を開く
4. ユーザーが認可 → PDS が `redirect_uri`（バックエンドのコールバック）へリダイレクト
5. `GET /bluesky_oauth_callback` が `client.callback(params)` でコード交換 → OAuth セッションを取得
6. コールバックは認可完了をフロントへ通知する（ポーリング方式: `/bluesky_oauth_start` 時に発行した一時キーをフロントが短時間ポーリングし、`/bluesky_oauth_callback` が結果を D1 に記録してクライアントが受け取る。またはフロントの「接続完了」ボタンで `POST /bluesky_oauth_confirm` を呼ぶ手動方式。手動方式の方がシンプルで他 SNS（Misskey の MiAuth）と操作感が揃うため、**手動方式を採用**する）
7. フロントが「接続完了」ボタンで `POST /bluesky_oauth_confirm` を呼ぶ → バックエンドが OAuth セッションを D1（token-store）に保管し、セッション ID + 表示用メタ（handle / did）を返す

### D3: stateStore / sessionStore の実装

- stateStore（認可フロー中の一時状態）: D1 の一時テーブル（または既存の `sns_credentials` とは別のキー空間）に短命保管（有効期限 10 分程度）。PKCE verifier・state・DPoP 鍵
- sessionStore: 既存の `token-store`（`sns_credentials` テーブル、AES 暗号化）に OAuth セッション（`Session` オブジェクト）を保管。`bluesky` タイプとして既存フォーマットに準拠
- DPoP 鍵: oauth-client-node は keyset の鍵（JWKS）を DPoP にも使用。鍵は環境変数の秘密情報としてサーバーにのみ存在

### D4: 投稿・自投稿取得の OAuth セッション利用

- `bluesky_post` / `bluesky_posts` は、現行の `resumeSession` → `refreshSession` を廃止し、保管した OAuth セッションを `client.restore(did)` で復元して実行する
- アクセストークン期限切れは oauth-client-node が自動リフレッシュし、新トークンは sessionStore 経由で D1 に書き戻される

### D5: パスワードログインの廃止と既存ユーザー

- `bluesky_login` エンドポイントを削除し、UI から ID/パスワード入力を除去する
- 既にパスワードログインで接続済みのユーザーは、保管済み session が有効な間は投稿・取得が継続できる（変更不要）。期限切れ後は OAuth での再接続が必要

## Risks / Trade-offs

- **Workers 互換性**: oauth-client-node が Cloudflare Workers で動作するかは実装着手時に検証する。動作しない場合の代替（バージョン更新 / XRPC 直叩き）を PPP-027 のタスク 3.6 と同様に検討する
- **metadata のドメイン依存**: `redirect_uris` が API ドメイン（Workers の URL）に紐づく。カスタムドメインを導入する場合はその時点で metadata を更新する
- **秘密鍵の管理**: JWKS の秘密鍵は環境変数（シークレット）に置く。漏洩時は metadata の jwks 更新と鍵の再発行が必要
- **stateStore の失効**: 認可フローの途中放棄（認可ページを開いたまま放置）による一時状態の残留は、有効期限で掃除する

## Migration Plan

1. （前提）PPP-027 が完了し、バックエンドが Workers 上で稼働している
2. バックエンド: oauth-client-node 導入、metadata / JWKS ルート、stateStore / sessionStore 実装
3. バックエンド: `bluesky_oauth_start` / `bluesky_oauth_callback` / `bluesky_oauth_confirm` 実装
4. バックエンド: `bluesky_post` / `bluesky_posts` を OAuth セッション利用へ変更
5. フロント: `BlueskyConnection.svelte` を OAuth UI へ変更
6. `bluesky_login` 削除、動作検証

## Open Questions

- oauth-client-node のバージョン（最新で OAuth フローが安定しているか）
- 既存パスワードセッションの有効期限（Bluesky 側のセッション TTL。実測で確認）
