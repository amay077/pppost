# Threads カルーセル投稿の子コンテナ指定と完了待ちを修正する

## Why

画像 3 枚を添付した Threads 投稿が失敗する。Netlify Function のログ:

```
threads container creation failed: 400 {"error":{"message":"Invalid parameter","type":"OAuthException",
"code":100,"error_subcode":4279004,"error_user_title":"Invalid Carousel Children",
"error_user_msg":"The children with IDs 17978727222117458, 17978727216117458 are invalid, nonexistent, or expired."}}
```

原因は 2 つある。

1. **`is_carousel_item=true` が付与されていない**。[Threads API のカルーセル投稿](https://developers.facebook.com/docs/threads/posts)では、item container 作成時にこのパラメータを指定することが求められている。付与しないと子は通常の単画像コンテナとして作られ、親 `media_type=CAROUSEL` の `children` としてカルーセルの子に解決できず `subcode 4279004` になる。`backend/netlify/functions/threads_post.js` の子コンテナ作成（`media_type=IMAGE` / `image_url` / `access_token` のみ）に該当パラメータがない。

2. **子コンテナの処理完了を待っていない**。Threads のメディアコンテナは Meta 側で非同期に処理される。現行実装は子コンテナを並列作成した直後、待機なしで親コンテナ作成へ進む。3 枚のうち 2 枚だけが invalid と報告されている点は、処理の進み方に差が出たことで説明がつく。既存の完了待ち（`waitForContainerReady`）はトップレベルのコンテナにしか適用されておらず、この経路を保護しない。

あわせて、コンテナ作成失敗時のログが全経路で共通の文言のため、ログだけでは子・親・単画像のどの段階で失敗したのか判別できない。今回の調査でもこの切り分けに手間がかかった。

## What Changes

- カルーセルの子コンテナ作成に `is_carousel_item=true` を付与する
- 親 `media_type=CAROUSEL` コンテナを作成する前に、すべての子コンテナが `status=FINISHED` になるまで待機する（子ごとに並列で待つため、所要時間は最も遅い子に依存する）
- 完了待ちを固定回数ループ（1 秒 × 6 回）からデッドライン方式へ変更する。`handler` の先頭で呼び出し全体の実行時間予算を確定し、本投稿と PR ゴースト投稿で共有する
- PR ゴースト投稿は、本投稿完了時点で残り予算が不足している場合に試行しない
- コンテナ作成失敗ログに作成段階のラベル（`text` / `image` / `carousel-item` / `carousel` / `ghost`）を含める
- `threads-posting` spec の「Supabase に一時保存された公開 URL」という記述を、実装に合わせて Cloudflare R2 に訂正する

### 実行時間予算をデッドライン方式にする理由

Netlify の同期 Function は Free プランで 10 秒（Pro で 26 秒）の実行時間制限がある。Background Functions は有料プラン限定のため選択できない。

子の完了待ちを追加すると、従来の「親のみ 1 秒 × 最大 6 回」という固定ループでは、子の待機時間と合算して制限を超えうる。呼び出し開始時点で絶対時刻のデッドラインを 1 つ決め、子の待機・親の待機・PR ゴースト投稿がそれを共有して消費する方式にすれば、待機の総量が構造的に制限内へ収まる。ポーリング間隔は 0.5 秒とし、限られた予算内での確認回数を確保する。

配分は定数（全体 8500ms / 子の待機上限 5000ms / PR ゴースト投稿の下限 2000ms）に集約し、実測に応じて調整できるようにする。

### 検討して採用しなかった案

「子作成 → 状態ポーリング → 親作成 → 公開」をフロント主導の複数リクエストへ分割すれば、1 リクエストあたりの実行時間制限から解放される。ただしバックエンドの API 形状とフロントの投稿フロー、および失敗通知の仕組み（`### Requirement: Threads 画像投稿失敗時のエラー通知`）を作り直す必要があり、本 change の目的（失敗している投稿を直す）に対して規模が見合わない。デッドライン制で恒常的に予算超過が起きる場合の次善策として残す。

## Non-Goals

- コンテナ作成・公開のリトライ（現行同様、失敗は 1 回でその投稿を失敗として扱う）
- `waitForContainerReady` の状態取得が HTTP エラーを返したときに再試行すること（現行の即失敗を維持する）
- `r2_presigned_url.js` が拡張子から MIME を組み立てているため `jpg` が `image/jpg` になる問題（フロントは常に `.png` で送るため今回の事象には無関係）
- 画像投稿のフロントエンド側（`frontend/src/lib/MainContent.ts`、`storage-client.ts`）の変更

## Impact

- **Affected specs**: threads-posting (変更)
- **Affected code**: `backend/netlify/functions/threads_post.js` のみ。フロントエンドの変更はなし（エラー応答の形は変えないため、`res.ok` で判定している呼び出し側に影響しない）
- **Breaking changes**: なし
- **関連 Issue**: [#28](https://github.com/amay077/pppost/issues/28)
