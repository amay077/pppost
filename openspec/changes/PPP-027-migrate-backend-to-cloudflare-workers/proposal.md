# バックエンドを Netlify Functions から Cloudflare Workers へ移管

## Why

- Netlify Functions の同期実行には壁時計ベースの実行時間制限（公称: 既定 10 秒、引き上げ時 26 秒。`backend/netlify.toml` にタイムアウト設定は無く既定値が適用される）があり、Misskey への画像 3 枚投稿がタイムアウトした実績がある（#25。1 枚あたり約 10 秒かかるアップロードの並列化で暫定回避済みだが、枚数・画像サイズ次第で再発しうる構造は残っている）
  - なお `backend/netlify/functions/misskey_post.js` のコメントは「30 秒」と記しているが出典が確認できないため、本 proposal では Netlify の公称値を根拠として扱う
- バックエンドは既に Cloudflare D1（トークン保管）と R2（画像一時保存）に依存しており、これらへ **HTTP API 越し**にアクセスするために、アカウント全体へ効く `CF_API_TOKEN` を Netlify 側へ預けている
- Cloudflare Workers へ移管すると、(1) 壁時計 30 秒級の実行時間制限が撤廃され、実行時間の制約は CPU 時間ベースになる（画像転送の大半を占める fetch 待ちは CPU 時間にカウントされない。エッジ側の応答開始待ちには別途上限（一般に約 100 秒）があるが、現行の投稿処理はこれに達しない）、(2) D1/R2 がネイティブバインディングになりレイテンシと権限スコープが改善、(3) ランタイムから `CF_API_TOKEN` という秘密情報が不要になる（デプロイには Cloudflare の認証が別途必要だが、手動運用では `wrangler login` の OAuth で足り、常設トークンは不要。CI 化する場合のみ `Workers Scripts:Edit` にスコープしたトークンを GitHub Secrets へ置く。D11）、(4) ベンダーが Cloudflare に集約される

## What Changes

- `backend/worker/` を新設し、**単一 Worker + Hono ルーター**で既存 22 関数とパス互換の API を実装する（フロントの変更は `VITE_API_ENDPOINT` の差し替えのみ）
- 現在 22 関数へ複製されている CORS プリアンブルとセッション検証を、Hono のミドルウェアへ集約する（`netlify.toml` の `[[headers]]` によるプラットフォーム側の CORS 設定が無くなるため、Worker 側で完結させる）
- D1 アクセスを HTTP API からバインディングへ変更する（`lib/d1.js` を書き換え、D1 バインディングを引数で受け取る形に統一する。`token-store.js` / `pr-ghost.js` はロジック変更なしの**機械的な書き換え**（引数の追加）のみで移植する）
- `wrangler.toml` に `nodejs_compat` と `compatibility_date`（2025-04-01 以降）を指定し、vars / secrets を `process.env` から参照できる状態にする（`crypto.js` 等の `process.env` 直読みをロジック変更なしで移植するため）
- `bluesky_post` が OGP 取得・サムネイル取得で行っている**自己 HTTP 呼び出し**（`process.env.URL` + `/.netlify/functions/...`）を廃止し、`cors_proxy` / `fetch_image` の処理本体を共有関数として `src/lib/` へ切り出して直接呼び出す（ルートとしての `cors_proxy` / `fetch_image` は同じ共有関数を使って従来どおり公開する）
- `threads_post` の実行時間予算（[#28](https://github.com/amay077/pppost/issues/28) が Netlify の壁時計 10 秒制限から逆算して導入した定数）を、Workers の制約（エッジの応答開始タイムアウト約 100 秒・CPU 30 秒/リクエスト）から再導出し、Threads の 10 枚カルーセルが予算切れで失敗しない値へ引き上げる（D12）
- 暗号形式（AES-256-CBC、`ivHex:cipherHex`）は変更せず、既存 `enc_token` の**データ移行をゼロ**にする
- 依存を Workers 互換へ置換する: sharp → `@cf-wasm/photon`（WASM）、jsdom → cheerio、`@aws-sdk/*` → `aws4fetch`、node-fetch / form-data → ネイティブ `fetch` / `FormData`
- `ver` の mustache 置換ハック（`replace.cjs`）を廃止し、`wrangler.toml` の vars へ置き換える
- Workers Paid プラン（$5/月、CPU 30 秒/リクエスト）を採用する（WASM リサイズの CPU 余裕のため）
- 並走デプロイ → `VITE_API_ENDPOINT` 切り替え → 安定後に Netlify 廃止、の 3 段階で移行する。ロールバックはエンドポイントを戻すだけで、セッション・トークンは D1 に居るためユーザーの再接続は発生しない
- デプロイは当面 `wrangler deploy` の手動実行とし、GitHub Actions 化は Phase 3 以降の任意タスクとする

### 実施順序の注記

Mastodon 削除（[#29](https://github.com/amay077/pppost/issues/29)）を先に実施すると、jsdom の書き換え（`mastodon_posts`）が丸ごと消え、sharp 代替も Bluesky 1 箇所へ減るため、本移管の書き換え対象が 4 本 → 2 本になる。先行実施を推奨する。

### 既存 change との前提関係

本 change の spec デルタは、以下の 2 つの change が**先にアーカイブされること**を前提に記述している（同一 Requirement へのデルタが衝突するため）。

- [#29](https://github.com/amay077/pppost/issues/29)（PPP-029-remove-mastodon-posting）: `credential-custody` の「SNS トークンのサーバー暗号化保管」へのデルタは、#29 適用後の本文（Mastodon を含まない列挙）をベースにしている
- [#28](https://github.com/amay077/pppost/issues/28)（PPP-028-fix-threads-carousel-children）: `threads-posting` の「公開前のコンテナ処理完了待ち」へのデルタは、#28 適用後の本文（子コンテナの完了待ち・実行時間予算を含む）をベースにしている

いずれかが先にアーカイブされなかった場合は、本 change のアーカイブ前にデルタのベース本文を取り直す。

## Non-Goals

- フロント側での画像縮小（サーバーリサイズ撤廃により Free プランへ落とす最適化）。将来の別 change
- Mastodon 投稿対応の削除（[#29](https://github.com/amay077/pppost/issues/29) で対応）
- 各 SNS への投稿仕様・UI の変更（挙動は現状維持。エンドポイントの互換性を保つ）
- D1 スキーマの変更
- デプロイの CI/CD 化（GitHub Actions 化）。Phase 3 以降の任意タスクとして扱う

## Impact

- **Affected specs**: backend-hosting (新規)、threads-posting (MODIFIED: 実行時間制約の記述を基盤非依存へ)、credential-custody (MODIFIED: 認証情報の保管とアクセス方式の記述を更新)
- **Affected code**:
  - 新規: `backend/worker/`（wrangler.toml、Hono ルート 22 本、lib 移植 6 本 + `cors_proxy` / `fetch_image` の共有関数）
  - 変更: GitHub Actions Variables の `VITE_API_ENDPOINT`（カットオーバー時）、`README.md`、`R2_SETUP.md`
  - 新規（任意タスク採用時のみ）: `.github/workflows/deploy_worker.yml`（デプロイ自動化。Phase 3 以降）
  - 廃止（Phase 3）: `backend/netlify/`、`backend/netlify.toml`、`backend/script/replace.cjs`、Netlify サイト、`CF_ACCOUNT_ID` / `CF_D1_DATABASE_ID` / `CF_API_TOKEN` / `PPPOST_TWITTER_*` 等の secrets
- **Breaking changes**: なし（パス互換・データ移行ゼロ。ユーザーの再接続不要）
- **関連 Issue**: [#27](https://github.com/amay077/pppost/issues/27)
