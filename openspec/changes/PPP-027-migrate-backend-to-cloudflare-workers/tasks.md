# Implementation Tasks

## 1. 基盤（backend/worker/）

- [ ] 1.1 `backend/worker/` を新設し、`package.json`（hono / aws4fetch / @atproto/api / cheerio / @cf-wasm/photon / encoding-japanese / typescript / wrangler）を作成する。cheerio は `fetch_title` / `foursquare_scrape` / OGP 抽出で使うため、#29 の先行有無にかかわらず維持する
- [ ] 1.1a `tsconfig.json` を作成する（`module: ESNext`、`moduleResolution: bundler`、`strict`、`noEmit`。Workers ランタイム向け `types: ["@cloudflare/workers-types"]` を指定し、`src/**/*.ts` を対象とする）
- [ ] 1.1b ルート・lib の共通型定義（`src/lib/types.ts`）を用意する（リクエスト body の型・各ルートのレスポンス型・`token-store` / `pr-ghost` の引数型）
- [ ] 1.2 `wrangler.toml` を作成する。以下を明記する
  - `compatibility_flags = ["nodejs_compat"]` と `compatibility_date = "2025-04-01"` 以降（vars / secrets を `process.env` から参照するための前提。D9）
  - D1 バインディング `DB`（既存データベースを指定）
  - `[limits]` の `cpu_ms`（Paid 既定の 30,000 ms を明示。実測（5.3）次第で見直す）
  - `[vars]`（非機密のみ）: `ENV_VER`、`R2_ACCOUNT_ID`、`R2_BUCKET_NAME`、`R2_PUBLIC_URL`
  - `BUILD_AT` はデプロイ時に `--var BUILD_AT:<ISO8601>` で注入する（`package.json` の deploy スクリプトに閉じ込める）
  - Netlify が自動注入していた `URL` は**移植しない**（自己 HTTP 呼び出しを廃止するため。4.3）
- [ ] 1.3 secrets を `wrangler secret put` で登録する。対象は `PPPOST_DATA_SECRET`、`PPPOST_THREADS_CLIENT_ID`、`PPPOST_THREADS_CLIENT_SECRET`、`PPPOST_THREADS_REDIRECT_URL`、`R2_ACCESS_KEY_ID`、`R2_SECRET_ACCESS_KEY`、および `PPPOST_MASTODON_CLIENT_AUTH_MASTODON_JP` / `PPPOST_MASTODON_CLIENT_AUTH_MASTODON_CLOUD`（#29 が先行完了した場合は Mastodon 分を省略）。`CF_ACCOUNT_ID` / `CF_D1_DATABASE_ID` / `CF_API_TOKEN` は登録しない
- [ ] 1.4 現行 R2 API トークンのスコープを確認し、対象バケットに限定されていなければ「オブジェクトの読み取りと書き込み・対象バケット限定」で再発行したうえで、1.3 の R2 クレデンシャルとして登録する
- [ ] 1.5 Hono アプリ（`src/index.ts`）を作成し、CORS ミドルウェア（`Access-Control-Allow-Origin: *`、`Access-Control-Allow-Headers` に `Authorization` / `Content-Type`、すべてのルートで `OPTIONS` プリフライトに 204 応答）を一元化する。`netlify.toml` の `[[headers]]` に相当するプラットフォーム側の保険は無いため、Worker 側で完結させる
- [ ] 1.6 セッション検証ミドルウェア（Bearer 抽出。必要ルートで 401）を作成する

## 2. lib 移植（src/lib/）

- [ ] 2.1 `d1.ts` を D1 バインディング（`db.prepare().bind()`）で書き換え、シグネチャを `query(db, sql, params)` へ変更する（D2）
- [ ] 2.2 `crypto.ts` を TypeScript（ESM）で書き直す（`node:crypto` の AES-256-CBC・`ivHex:cipherHex` 形式・`process.env.PPPOST_DATA_SECRET` からの鍵導出は不変。D9 により `process.env` 参照のまま移植する）
- [ ] 2.3 `session.ts` / `misskey-host.ts` / `token-store.ts` / `pr-ghost.ts` を TypeScript（ESM）で移植する。`token-store.ts` / `pr-ghost.ts` は D1 バインディングを第 1 引数で受け取る形へ機械的に変更し、ロジックは変更しない
- [ ] 2.4 **移行ゲート**: 本番 D1 の既存 `enc_token`（検証用に発行した行）を Workers 上で復号できることを確認する。これにより `process.env` へのテキストバインディング投入（D9）と `node:crypto` 互換（D3）を同時に検証する。失敗した場合は D9 の代替案（全 lib を `env` 引数化）へ切り替える

## 3. 機械的ルート移植（fetch / FormData 置換のみ）

- [ ] 3.1 threads_token / threads_refresh / threads_posts を移植する（`threads_post` は実行時間予算の再導出を伴うため 4.7 で扱う）
- [ ] 3.2 misskey_token / misskey_post / misskey_posts を移植する（画像アップロードの並列化は維持）
- [ ] 3.3 sns_disconnect / pr_ghost_setting を移植し、mastodon_token を移植する（#29 が先行完了した場合は mastodon_token を省略）
- [ ] 3.4 `cors_proxy` / `fetch_image` の処理本体を `src/lib/fetch-remote.ts` の共有関数（`fetchRemoteText(url)` / `fetchRemoteImageDataUri(url)`）として切り出し、ルート `/cors_proxy` / `/fetch_image` はその薄いラッパとして実装する（D10）
- [ ] 3.5 fetch_title / foursquare_scrape / ping を移植する
- [ ] 3.6 bluesky_login / bluesky_posts を移植する（@atproto/api は無改変）。**着手前に** `@atproto/api`（`^0.10.0`）が Workers 上で動作すること（`BskyAgent` のログイン成功）を単独で確認し、動かない場合はバージョン更新、それでも駄目なら XRPC 直叩きへ切り替える

## 4. 書き換えを伴うルート移植

- [ ] 4.1 `r2_presigned_url` を aws4fetch による presigned PUT URL 生成へ書き換える（有効期限・キー命名は現状維持）
- [ ] 4.2 `bluesky_post` の `resizeImageIfNeeded`（976,560 B 超で縮小・JPEG q80）を @cf-wasm/photon で書き換える。あわせて `sharp().metadata()` による寸法取得（Bluesky の `aspectRatio`）を Photon の `get_width()` / `get_height()` へ置き換え、デコード失敗時は縮小せず元データで続行する（D4）
- [ ] 4.3 `bluesky_post` の OGP 取得・サムネイル取得を、3.4 の共有関数の**直接呼び出し**へ書き換える（`process.env.URL` と `/.netlify/functions/...` への自己 HTTP 呼び出しを除去する。D10）
- [ ] 4.4 `mastodon_post` の 5 MB 超リサイズ（JPEG q85）を @cf-wasm/photon で書き換える（#29 が先行完了した場合は本タスクを省略）
- [ ] 4.5 `mastodon_posts` の jsdom を cheerio へ書き換える（`<br>`→改行、最初の `<p>` の textContent。#29 が先行完了した場合は省略）
- [ ] 4.6 `ver` を `[vars]`（`ENV_VER`・`BUILD_AT`）参照で再実装し、レスポンス形（`{ build_at, env_ver }`）を維持する。`replace.cjs` / `ver.mustache` は Phase 3 の削除対象に含める（7.2）
- [ ] 4.7 `threads_post.ts` を移植し、あわせて実行時間予算を再導出する。[#28](https://github.com/amay077/pppost/issues/28)（PPP-028）が導入した予算定数（`OVERALL_BUDGET_MS` / `CHILD_WAIT_BUDGET_MS` / `GHOST_MIN_BUDGET_MS`。いずれも Netlify の壁時計 10 秒制限から逆算した値）を、Workers の制約（エッジの応答開始タイムアウト約 100 秒・CPU 30 秒/リクエスト）から再導出して設定する。具体値は #28 の実装とあわせて決め、5.4 のゲートで検証する。移植先コードでは、`threads_post.ts` に複数箇所ある基盤名依存の根拠コメント（ファイル冒頭の説明・予算定数の定義部・`waitForContainerReady` 付近の `Netlify 同期 Function の実行時間制限` 等）をすべて、Workers の制約に基づく記述へ書き換える（D12）

## 5. Phase 1: 並走検証（workers.dev）

- [ ] 5.0 **移行ゲート**: `tsc --noEmit` が型エラーなしで通ることを確認する（以降の実装・検証は型チェック済みの状態で進める）
- [ ] 5.1 `wrangler deploy`（手動実行。D11）で `pppost-api.<account>.workers.dev` へデプロイする
- [ ] 5.2 `backend/test.http` に Workers 向けセクションを追加し、全ルートを手動実行する
- [ ] 5.3 **移行ゲート**: 8 MB の JPEG 1 枚を Bluesky 上限（976,560 B 以下・q80）へリサイズする際の CPU 時間を `wrangler tail` の `cpuTime` で計測し、**1 枚あたり 3,000 ms 以下**（Paid 既定上限 30 秒の 10% 未満）であることを記録する。超過する場合は `[limits] cpu_ms` の引き上げ、またはフロント側縮小の前倒しを検討する。あわせてデプロイ後のバンドルサイズを記録し、Workers の上限に対する余裕を確認する
- [ ] 5.4 **移行ゲート**: Misskey へ画像 3 枚投稿がタイムアウトなしで完了することを確認する。あわせて Threads へ画像 10 枚（カルーセル上限）を投稿し、応答開始までの総所要時間がエッジのタイムアウト（約 100 秒）に対して余裕があることを記録する。合格条件は「4.7 で再導出した予算値のもとで 10 枚カルーセルが予算切れによる失敗を起こさず投稿完了すること」とし、本ゲートが 4.7 の検証を兼ねる
- [ ] 5.5 **移行ゲート**: Bluesky へ URL 付き（OGP 画像あり・YouTube の 2 パターン）で投稿し、リンクカードにタイトルとサムネイルが表示されることを確認する（4.3 の退行検知）
- [ ] 5.6 検証は専用セッション ID で行い、本番セッションと分離する
- [ ] 5.7 Misskey のホスト検証（`localhost` / IP リテラル / `../../api/i` 拒否）が Workers 上でも 400 を返すことを確認する
- [ ] 5.8 GitHub Pages のオリジンから Workers を呼び、`Authorization` 付きリクエストのプリフライトが成功しブラウザにブロックされないことを確認する

## 6. Phase 2: カットオーバー

- [ ] 6.1 GitHub Actions Variables の `VITE_API_ENDPOINT` を Workers の URL へ変更する（ユーザー操作）
- [ ] 6.2 フロント再デプロイ後、接続済みセッションのまま各 SNS へ投稿できること（再接続不要）・画像アップロード・URL タイトル展開・バージョン表示が動作することを確認する
- [ ] 6.3 **ロールバック実施検証**: カットオーバー直後に `VITE_API_ENDPOINT` を Netlify へ戻して再デプロイし、接続済みセッションのまま投稿・自投稿取得が動作することを 1 度確認する（確認後に再度 Workers へ戻す）
- [ ] 6.4 ロールバック手順（`VITE_API_ENDPOINT` を戻して再デプロイ）を README に記録する

## 7. Phase 3: Netlify 廃止（安定確認後）

- [ ] 7.1 1〜2 週間の安定稼働を確認する。判定条件は「期間中に Workers の 5xx 応答が全リクエストの 1% 未満」かつ「投稿失敗の報告がゼロ」とする。この期間中、Netlify サイトは停止せず稼働を維持する（ロールバック先として残す）
- [ ] 7.2 Netlify 資産を削除する: `backend/netlify/`（`ver.mustache` を含む）、`backend/netlify.toml`、`backend/script/replace.cjs`、`backend/package.json` の `replace` スクリプトと Netlify 依存（netlify-cli、mustache、sharp、jsdom、node-fetch、form-data、@aws-sdk、twitter-api-v2）
- [ ] 7.3 Netlify サイトを停止し、Netlify 側の環境変数を削除する
- [ ] 7.4 `backend/.env.example` を Workers 構成（wrangler の `[vars]` と secrets 一覧）へ書き換える
- [ ] 7.5 （任意）GitHub Actions によるデプロイ自動化を検討する。採用する場合は `.github/workflows/deploy_worker.yml` を追加し、`CLOUDFLARE_API_TOKEN` は `Workers Scripts:Edit` にスコープして GitHub Secrets へ置く（D11）

## 8. ドキュメント

- [ ] 8.1 README のアーキテクチャ・開発コマンド（`npm run dev` → `wrangler dev`）・デプロイ手順（Netlify の自動デプロイ → `wrangler deploy` の手動実行）を更新する
- [ ] 8.2 R2_SETUP.md の presigned URL 発行者の記述を更新し、API トークンの権限記述を「対象バケットに限定（必須）」へ改める
- [ ] 8.3 archive の直前に `openspec list` で PPP-028 / PPP-029 がアーカイブ済みであることを確認する。未アーカイブのものがある場合は、対応するデルタ（`specs/threads-posting/spec.md` / `specs/credential-custody/spec.md`）のベース本文を `openspec/specs/` の現行本文から取り直し、本 change の意図した変更のみが差分となる状態へ直してから archive する
