# X 投稿対応（x-post-api の開発と PPPOST 統合）

## Why

X (Twitter) は公式 API の課金・制限により PPPOST から廃止した。しかし、日常の投稿先として X を復活させたいという要求がある。公式 API を使わず、macOS 上の Chrome にログイン済みの X アカウントを操作する `x-post-api` を開発し、PPPOST から tailnet 経由で呼び出すことで、追加の API 課金なしに X 投稿を実現する。

`x-post-api` は別リポジトリではなく、本リポジトリ内の `x-post-api/` として管理する。ホストは開発機とは別の Mac で、Tailscale はインストールされていないため、Docker の Tailscale コンテナを tailnet の入口とする。

## What Changes

- `x-post-api/` を新設する
  - macOS の Chrome を AppleScript + JS で操作する HTTP API
  - Bearer 認証、入力検証、重み付き 280 文字、冪等性、排他制御、レート制限、監査ログ、CORS
  - Docker の Tailscale コンテナによる tailnet 内 HTTPS 公開（`tailscale funnel` は使わない）
  - launchd による常駐化
  - 単体テスト・結合テスト（Chrome はモック）
- PPPOST のフロントエンドに X を投稿対象として追加する
  - X 接続 UI（API URL・トークン・`GET /health` による接続テスト）
  - テキスト投稿のみ（画像・動画・リプライ・引用は対象外）
  - `Idempotency-Key` の付与、自動リトライ禁止、エラーコードの表示
  - 非対応要素がある場合は X を選択不可にする
  - 文字数表示を重み付き 280 に変更する
- OpenSpec に `x-posting` と `x-post-api` の capability を追加し、`sns-posting` を更新する

**BREAKING**: なし。X は新しい投稿対象であり、既存 SNS の挙動は変えない。

## Impact

- **Affected specs**: `sns-posting` (MODIFIED), `x-posting` (ADDED), `x-post-api` (ADDED)
- **Affected code**:
  - `x-post-api/`（新規）
  - `frontend/src/lib/func.ts`
  - `frontend/src/lib/XConnection.svelte`（新規）
  - `frontend/src/lib/MainContent.ts`
  - `frontend/src/lib/MainContent.svelte`
  - `README.md`
  - `.gitignore`
- **Breaking changes**: なし
