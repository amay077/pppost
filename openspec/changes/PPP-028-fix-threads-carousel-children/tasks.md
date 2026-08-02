# Implementation Tasks

## 1. 実行時間予算の導入（threads_post.js）

- [x] 1.1 定数 `OVERALL_BUDGET_MS`（8500）、`CHILD_WAIT_BUDGET_MS`（5000）、`GHOST_MIN_BUDGET_MS`（2000）、`POLL_INTERVAL_MS`（500）を定義する
- [x] 1.2 `handler` の先頭で `const deadline = Date.now() + OVERALL_BUDGET_MS` を計算する
- [x] 1.3 `waitForContainerReady` を `(creation_id, token, deadline)` 形式に変更し、固定回数ループ（1 秒 × 6 回）をデッドライン方式のループへ置き換える
- [x] 1.4 予算が尽きていても状態確認を必ず 1 回は行い、次のポーリングが予算を超える場合にループを打ち切る
- [x] 1.5 `FINISHED` → true、`ERROR` / `EXPIRED` / HTTP エラー / 予算切れ → false という既存のセマンティクスを維持する
- [x] 1.6 `doThreadsPost` の引数に `deadline` を追加し、トップレベルコンテナの待機へ渡す

## 2. カルーセル投稿の修正（threads_post.js）

- [x] 2.1 子コンテナ作成のパラメータへ `is_carousel_item: true` を追加する
- [x] 2.2 子コンテナ作成失敗時に投稿全体を失敗とする既存の判定を維持する
- [x] 2.3 親コンテナ作成の前に、`Math.min(deadline, Date.now() + CHILD_WAIT_BUDGET_MS)` を期限として全子コンテナの `FINISHED` を並列に待つ
- [x] 2.4 いずれかの子が `FINISHED` にならない場合、親コンテナを作成せず `threads child container not ready` を返す
- [x] 2.5 親コンテナへの `reply_to_id` 付与（`replyParams`）が従来どおり維持されていることを確認する

## 3. PR ゴースト投稿の予算考慮（threads_post.js）

- [x] 3.1 `tryPostPrGhost` の引数に `deadline` を追加する
- [x] 3.2 残り予算が `GHOST_MIN_BUDGET_MS` 未満の場合、D1 を参照せずログを出して return する
- [x] 3.3 スキップ時に D1 の実行状態を更新しないことを確認する（次回の本投稿で再試行される）
- [x] 3.4 ゴースト投稿の `doThreadsPost` 呼び出しへ `deadline` を渡す

## 4. ログの改善（threads_post.js）

- [x] 4.1 `createContainer` に第 2 引数 `label` を追加し、失敗ログへ含める
- [x] 4.2 各呼び出し箇所へラベルを付ける（`text` / `image` / `carousel-item` / `carousel` / `ghost`）

## 5. 動作検証

- [x] 5.1 `node --check backend/netlify/functions/threads_post.js` が通る
- [ ] 5.2 `cd backend && npm run dev` で起動し、`cd frontend && npm run dev` から Threads へ接続する
- [ ] 5.3 画像 3 枚 + 本文を投稿し、カルーセル投稿が成功して 3 枚が正しい順序で表示される（本 change の再現ケース）
- [ ] 5.4 画像 2 枚の投稿が成功する
- [ ] 5.5 画像 1 枚の投稿が従来どおり成功する（デグレしていないこと）
- [ ] 5.6 画像なし（テキストのみ）の投稿が従来どおり成功する
- [ ] 5.7 リプライ元を選択したうえで画像 3 枚を投稿し、リプライとして公開される
- [ ] 5.8 Netlify Function ログで `Duration` が実行時間制限（10 秒）未満に収まっている
- [ ] 5.9 失敗時のログに作成段階のラベルが含まれ、どの段階の失敗か判別できる
- [ ] 5.10 PR 設定を有効にした状態で画像 3 枚を投稿し、本投稿が成功する（予算不足でスキップされた場合に D1 の実行状態が更新されていないこと）
- [ ] 5.11 `npx openspec validate PPP-028-fix-threads-carousel-children --strict` が通る

## 6. アーカイブ時

- [ ] 6.1 archive 後、`openspec/specs/threads-posting/spec.md` の該当 3 要件が差し替わっていることを確認する
- [ ] 6.2 `npx openspec validate --strict` が通ることを確認する
