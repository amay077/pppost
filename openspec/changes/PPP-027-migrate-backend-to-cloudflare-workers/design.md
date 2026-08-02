# 技術設計

## Context

バックエンドは Netlify Functions（Node.js CommonJS、22 関数）で、トークン保管は Cloudflare D1、画像一時保存は Cloudflare R2。D1 へは HTTP API（`CF_API_TOKEN`）、R2 へは S3 互換 API（`@aws-sdk`）でアクセスしている。フロントは GitHub Pages 上の SPA で、`VITE_API_ENDPOINT` だけを頼りにバックエンドを呼ぶ。

制約:

- Netlify Functions の同期実行の壁時計制限（公称: 既定 10 秒、引き上げ時 26 秒）が画像投稿系のボトルネック（#25 で実測: Misskey へのドライブアップロードが 1 枚約 10 秒）
- D1 の既存データ（`sns_credentials` の `enc_token`、`pr_ghost_state`）は稼働中であり、移行でユーザーの再接続を発生させない

## Goals / Non-Goals

- Goals:
  - 壁時計 30 秒級の実行時間制限の撤廃（実行時間モデルを CPU 時間ベースへ。エッジ側の応答開始タイムアウト（一般に約 100 秒）は残るため、最悪ケースはこれを基準に評価する）
  - フロント変更を `VITE_API_ENDPOINT` の差し替えのみに抑える
  - D1 データ移行ゼロ・ユーザー再接続ゼロ
  - ランタイムからの `CF_API_TOKEN`（アカウント全体に効く秘密情報）の廃止
- Non-Goals:
  - フロント側画像縮小、Mastodon 削除（#29）、投稿仕様の変更、D1 スキーマ変更、デプロイの CI/CD 化

## Decisions

### D1: 単一 Worker + Hono ルーターとし、既存パス名を温存する

**決定**: 関数ごとに Worker を分けず、1 つの Worker に Hono で 22 ルートを実装する。パスは `/misskey_post` 等の既存名をそのまま使う。

**理由**: フロントは `${Config.API_ENDPOINT}/関数名` の形で呼んでおり、パス互換にすれば環境変数 1 つの差し替えでカットオーバーとロールバックが完結する。また現在 22 関数へ複製されている CORS プリアンブル・セッション検証を、ミドルウェア 2 つに集約できる。

**代替案**: 関数ごとの Worker 分割。デプロイ・バインディング設定が 22 倍になり、この規模では利点がない。

### D2: D1 はバインディングへ移行し、バインディングを引数で明示的に渡す

**決定**: `env.DB.prepare(sql).bind(...params)` を使う実装へ `d1.js` を書き換え、シグネチャを `query(db, sql, params)` へ変更する。`token-store.js` / `pr-ghost.js` の各関数も第 1 引数に D1 バインディングを受け取る形へ変え、Hono ルートが `c.env.DB` を渡す。

**理由**: Netlify では `process.env` から実行時にグローバルへ取得できたが、Workers の D1 バインディングはオブジェクトであり、リクエストごとの `env`（Hono では `c.env`）にしか現れない（D9 参照）。`query(sql, params)` のシグネチャを維持するには、バインディングをモジュールスコープに退避するか `AsyncLocalStorage` を使う必要があるが、前者はリクエストをまたいだ I/O オブジェクト共有という Workers のアンチパターンに触れ、後者は暗黙の実行コンテキスト依存を持ち込む。引数で渡す方式は変更点が静的に追える（呼び出し箇所は `token-store.js` / `pr-ghost.js` の各関数と、それを呼ぶルートに限定される）ため、こちらを採る。ロジックの変更は無く、**機械的な引数追加**にとどまる。HTTP API の 1 クエリ 1 往復（200 ms 級）も解消する。

**代替案**: モジュールスコープ保持（リクエスト跨ぎの I/O オブジェクト共有で "Cannot perform I/O on behalf of a different request" を招きうる）、`AsyncLocalStorage`（`nodejs_compat` で利用可能だが、依存が暗黙になり検証しづらい）。

### D3: 暗号形式を変えず、既存 `enc_token` のデータ移行をゼロにする

**決定**: `nodejs_compat` フラグで `node:crypto` の `createCipheriv` / `createDecipheriv` / `randomBytes` をそのまま使い、AES-256-CBC・`ivHex:cipherHex` 形式・`PPPOST_DATA_SECRET` 先頭 32 バイト鍵を維持する。

**理由**: D1 の既存行がそのまま復号できれば、移行はコードの差し替えだけで済む。WebCrypto へ書き直す動機（性能・安全性の差）がない。**Phase 1 の最初に既存行の復号を実証する**（ここが通れば移行の大部分のリスクが消える）。

### D4: sharp は `@cf-wasm/photon` へ置換する

**決定**: リサイズ + JPEG 圧縮を WASM 版 Photon で実装する。対応入力フォーマットは JPEG / PNG / WebP とし、デコードに失敗した場合は**縮小せず元データのまま続行**する（従来の `try/catch` 相当の挙動を維持し、投稿自体は失敗させない）。`sharp().metadata()` による寸法取得（Bluesky の `aspectRatio`）は Photon の `get_width()` / `get_height()` へ置き換える。

**理由**: sharp はネイティブバイナリで Workers では動かない。リサイズが必須なのは Bluesky（blob 上限 976,560 B）で、Mastodon の 5 MB リサイズは Mastodon 削除（#29）で消える予定。Photon は `resize` と quality 指定 JPEG 出力を持ち、既存処理と一対一対応する。ただしフロントの入力は `accept="image/*"`（`frontend/src/lib/ImagePreview.svelte`）で HEIC 等も混入しうるため、デコード失敗時の扱いを上記のとおり明示する。

**代替案**: Cloudflare Images（ゾーン必須・課金体系が別）、フロント側縮小（image-upload 仕様の変更を伴うため別 change）。

### D5: R2 presigned URL は `aws4fetch` で生成する

**決定**: `@aws-sdk/client-s3` + `s3-request-presigner` を `aws4fetch`（約 7 KB）へ置換し、presigned PUT URL の発行フローは現状維持する。認証情報は対象バケットにスコープした S3 互換クレデンシャルを `wrangler secret` で持つ。

**理由**: R2 バインディングは presigned URL を発行できないため S3 互換 API の署名が引き続き必要。AWS SDK は Workers ではサイズ・互換性の面で過剰。ブラウザ直 PUT（バックエンドを画像バイトが通らない）という現在の利点を保つ。

### D6: プランは Workers Paid（$5/月）とする

**決定**: Free（CPU 10 ms/リクエスト）ではなく Paid（CPU 30 秒/リクエスト）で運用する。

**理由**: WASM リサイズは CPU 時間を消費し、Free の 10 ms では 1 回のリサイズで超過するおそれがある。検証コストに対して $5 は安い。画像転送そのものは fetch 待ち（CPU 外）なので、リサイズ以外は Free でも収まるが、余裕を買う。フロント側縮小（Non-Goals）を将来実装すれば Free へ落とす選択肢が戻る。

### D7: jsdom は cheerio へ置換する

**決定**: `mastodon_posts.js` の HTML デコード（`<br>`→改行、最初の `<p>` の textContent 抽出）を cheerio で書き直す。

**理由**: jsdom は Workers で動かない。用途が単純で、cheerio は既存依存（fetch_title 等で使用中）。Mastodon 削除（#29）が先行すればこのタスク自体が消える（cheerio 自体は `fetch_title` / `foursquare_scrape` / OGP 抽出で引き続き必要なので依存は維持する）。

### D8: `ver` は wrangler vars で再設計する

**決定**: `replace.cjs` による mustache 置換を廃止し、`ENV_VER` は `wrangler.toml` の `[vars]` に静的に置き、ビルド時刻は `BUILD_AT` var としてデプロイ時に `wrangler deploy --var BUILD_AT:<ISO8601>` で注入する。`/ver` のレスポンス形（`{ build_at, env_ver }`）は現状維持する。デプロイは手動実行（D11）のため、この `--var` は `backend/worker/package.json` の deploy スクリプト（日時を生成して渡す）に閉じ込める。

### D9: env / secrets の受け渡し方式

**決定**:

- `wrangler.toml` に `compatibility_flags = ["nodejs_compat"]` と `compatibility_date = "2025-04-01"` 以降を指定する。この構成では Workers が**テキスト値のバインディング（`[vars]` と secrets）を `process.env` へ自動投入する**ため、`crypto.js` の `process.env.PPPOST_DATA_SECRET` や R2 クレデンシャルの `process.env.*` 参照はロジック変更なしで動く。
- 一方、**D1 のようなオブジェクトのバインディングは `process.env` からは取得できない**ため、`d1.js` のみ Hono コンテキストの `c.env.DB` を受け取る形へ書き換える（D2）。

**理由**: 22 ルートと lib 6 本のうち、env に触れるのは `crypto.js`・`d1.js`・R2 署名・OAuth クライアント設定に限られる。テキスト値を `process.env` のままにできれば書き換え対象がオブジェクトバインディング（D1）1 点に絞られ、移植の差分と検証対象が最小になる。

**副作用 / 前提**: `compatibility_date` を 2025-04-01 以降に固定することが前提になる（それ以前の日付では `process.env` は空となり、全 lib の書き換えが必要になる）。Phase 1 の移行ゲート（tasks 2.4）で、`process.env.PPPOST_DATA_SECRET` 経由の鍵導出により既存 `enc_token` が復号できることを実機で確認し、この前提を検証する。

**代替案**: すべての lib を `env` 引数で受け取る形へ統一する（変更が静的に追える反面、22 ルートすべてに伝播が波及する）。ゲート 2.4 が失敗した場合はこちらへ切り替える。

### D10: Worker 内の自己 HTTP 呼び出しを廃止し、共有関数へ切り出す

**決定**: `bluesky_post` が OGP 取得・サムネイル取得で行っている自己 HTTP 呼び出し（`${process.env.URL}/.netlify/functions/cors_proxy?url=...`、`.../fetch_image?url=...`）を廃止する。`cors_proxy` の中身（外部 URL の fetch・文字コード判定・テキスト整形）と `fetch_image` の中身（外部 URL の fetch・data URI 化）を、`src/lib/fetch-remote.js` の共有関数（`fetchRemoteText(url)` / `fetchRemoteImageDataUri(url)`）として切り出し、`bluesky_post` はこれを**直接関数呼び出し**する。ルートとしての `/cors_proxy` / `/fetch_image` は同じ共有関数を使って従来どおり公開する（フロントが利用しているため）。

**理由**: 現行実装は (1) Netlify が自動注入する `URL` 環境変数、(2) `/.netlify/functions` という Netlify 固有パス、(3) 自分自身への HTTP サブリクエスト、という 3 つの Netlify 依存を同時に持つ。Cloudflare では自 Worker の自ルートへの fetch はループ扱いとなりうるうえ、無駄な往復とレイテンシを生む。呼び出し元の `try/catch` がエラーを握り潰すため、放置するとリンクカードのサムネイルが**無言で欠落**する（投稿自体は成功するので検知しづらい）。共有関数化すればルートと内部利用の挙動が一致し、退行も起きない。

**代替案**: Service Bindings で自 Worker を呼ぶ（同一 Worker では冗長）、`URL` 相当を vars で持って自己 fetch を続ける（往復コストと依存が残る）。

### D11: デプロイは当面手動 `wrangler deploy` とする

**決定**: 移行期間中のデプロイは、開発者のローカルからの `wrangler deploy` の手動実行とする。GitHub Actions（`wrangler-action`）による自動デプロイ化は Phase 3 以降の**任意タスク**として切り出す。

**理由**: 現行のバックエンドは Netlify の GitHub 連携で `main` への push により自動デプロイされているため、移行によりこの自動化はいったん失われる。しかしバックエンドの変更頻度は低く、移行期間は「並走中に何度も手で入れ替える」運用が主になるため、手動の方が制御しやすい。CI 化すると Workers スコープの Cloudflare API トークンを GitHub Secrets に置く判断が別途必要になり、移行そのものと切り離した方がリスクが小さい。

**射程の明確化**: `CF_API_TOKEN` の廃止は**ランタイム**の話であり、デプロイには引き続き Cloudflare の認証情報が必要になる。手動運用では開発者ローカルの `wrangler login`（OAuth）で足り、アカウント全体に効くトークンをどこにも常設しない。CI 化する場合は `Workers Scripts:Edit` にスコープしたトークンを GitHub Secrets へ置く。

### D12: `threads_post` の実行時間予算を Workers の制約から再導出する

**決定**: [#28](https://github.com/amay077/pppost/issues/28)（PPP-028）が `threads_post` に導入した予算定数（`OVERALL_BUDGET_MS` / `CHILD_WAIT_BUDGET_MS` / `GHOST_MIN_BUDGET_MS`）は Netlify の壁時計 10 秒制限から逆算した値であり、これをそのまま持ち込まない。Workers の制約（エッジの応答開始タイムアウト約 100 秒、CPU 30 秒/リクエスト）を基準に全体予算を大幅に引き上げ、Threads のカルーセル上限である 10 枚の子コンテナ完了待ちが収まる値へ再導出する。子コンテナ待ちと PR ゴースト投稿への配分も同じ比率の考え方（全体予算からゴースト用の下限を残し、残りを完了待ちに充てる）で引き直す。具体値はエッジタイムアウトに対する安全率を取ったうえで、#28 の実装とあわせて実装時に確定し、移行ゲート（tasks 5.4）の 10 枚カルーセル投稿で妥当性を検証する。あわせて `waitForContainerReady` 付近のコメントに残る `Netlify 同期 Function の実行時間制限` という記述を、Workers の制約に基づく根拠へ書き換える。

**理由**: `threads-posting` capability は「予算の値は実行基盤の制約から導き、特定のホスティングサービス名や秒数を仕様として固定してはならない (SHALL NOT)」と定めている。基盤が変わる本 change では予算の再導出が仕様上の必須作業であり、8,500 ms のまま移植すると 10 枚カルーセルは子コンテナ待ちの途中で打ち切られ、`backend-hosting` の「上限枚数のカルーセル投稿が完了する」シナリオを満たせない。導出の根拠は capability が求めるとおり設計文書に残す。

**代替案**: 予算を撤廃して無制限に待つ（エッジの応答開始タイムアウトで接続が打ち切られ、失敗を自前で扱えなくなるため採らない）。Netlify 時代の値を据え置く（上記のとおり仕様と矛盾する）。

## Risks / Trade-offs

- **Photon の CPU 実測が未知** → Phase 1 で 8 MB 級画像のリサイズ所要 CPU を実測する。合格基準は「1 枚あたり CPU 3 秒以下（Paid 既定上限 30 秒の 10% 未満）」とし、これを移行ゲートとする（tasks 5.3）
- **エッジ側の応答開始タイムアウト** → Workers に壁時計制限は無いが、Cloudflare のエッジは応答ヘッダが一定時間（一般に約 100 秒）返らない接続を打ち切る。最悪ケース（Threads 10 枚カルーセル）の総所要時間はこの値を基準に評価する（tasks 5.4）。`threads_post` の予算定数もこの値から再導出する（D12、tasks 4.7）
- **`nodejs_compat` での crypto 互換と `process.env` 投入** → Phase 1 冒頭で既存 `enc_token` の復号を検証。不一致ならその時点で中断（Netlify 継続、損害なし）、または D9 の代替案（env 引数化）へ切り替える
- **`@atproto/api` の Workers 互換性** → 依存は `^0.10.0` と古く Node 前提の実装が残る版のため、Bluesky 3 ルートの移植前に `BskyAgent` のログイン成功を単独で確認する。動かない場合はバージョン更新、それでも駄目なら XRPC 直叩きへ切り替える（tasks 3.6）
- **バンドルサイズ** → Photon の WASM と `@atproto/api` を同梱するため、デプロイ後のバンドルサイズを記録し、Workers の上限に対する余裕を確認する（tasks 5.3）
- **並走期間中の D1 同時書き込み** → 両環境とも同一スキーマ・同一 UPSERT のため破壊は起きないが、検証は専用セッション ID で行い本番セッションと分離する
- **Netlify 廃止後の遺物** → `backend/.env.example` の Twitter 系など、廃止時に secrets を棚卸しする

## Migration Plan

1. **Phase 1（並走）**: `backend/worker/` を新設し `pppost-api.<account>.workers.dev` へ手動デプロイ。`test.http` を Workers 向けに実行し全ルート検証。既存 `enc_token` の復号・Photon CPU 実測・Misskey 画像 3 枚投稿・Threads 10 枚カルーセル・Bluesky のリンクカードをゲートとする
2. **Phase 2（カットオーバー）**: GitHub Actions Variables の `VITE_API_ENDPOINT` を Workers へ切り替え、フロントを再デプロイ。直後にロールバック（値を Netlify へ戻す）を 1 度実施して安全弁が機能することを確認し、再び Workers へ戻す。Netlify サイトはこの期間、停止せず稼働を維持する
3. **Phase 3（廃止）**: 1〜2 週間の安定確認後、`backend/netlify/` および `backend/netlify.toml` / `backend/script/replace.cjs` の削除、Netlify サイトの停止、不要 secrets（`CF_*`、`PPPOST_TWITTER_*` 等）の削除

## Open Questions

- カスタムドメインを当てるか（`workers.dev` サブドメインで開始し、必要になったら追加で足りる）
- GitHub Actions によるデプロイ自動化を復活させるか（D11 により Phase 3 以降の任意タスク）
