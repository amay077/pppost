# Implementation Tasks

## 1. 公開失敗時の一時エラー判定（threads_post.js）

- [x] 1.1 定数 `MAX_PUBLISH_ATTEMPTS`（3）と `RETRY_MIN_BUDGET_MS`（2000）を定義する
- [x] 1.2 `isTransientPublishError(bodyText)` を追加し、エラーボディの JSON 解析結果が `error.code === 24 && error.error_subcode === 4279009` のとき true を返すようにする
- [x] 1.3 JSON 解析失敗時は false（再試行対象外）とする

## 2. publishContainer の失敗判定（threads_post.js）

- [x] 2.1 `publishContainer` が失敗時に `{ ok: false, retryable }` を返すように変更する（成功時は `{ ok: true }`）
- [x] 2.2 失敗ログ（`threads publish failed`）は従来どおり出力する

## 3. コンテナ再作成リトライの導入（threads_post.js）

- [x] 3.1 現行 `doThreadsPost` の中身を `doThreadsPostOnce` へ移し、公開失敗時に `retryable` を含む結果を返すようにする
- [x] 3.2 新 `doThreadsPost` をリトライループとして実装する: `retryable` かつ残り予算が `RETRY_MIN_BUDGET_MS` 以上の場合のみ、コンテナ再作成で最大 3 回試行する
- [x] 3.3 リトライ発生時に `console.warn` で発生頻度を観測できるログを出力する
- [x] 3.4 4279009 以外の失敗・予算不足時はリトライせず従来どおり失敗を返すことを確認する
- [x] 3.5 ゴースト投稿（`tryPostPrGhost`）が同一経路で自動的にリトライの恩恵を受けることを確認する

## 4. 動作検証

- [x] 4.1 `node --check backend/netlify/functions/threads_post.js` が通る
- [ ] 4.2 デプロイ後に本番ログでリトライ発生（`console.warn`）→ 成功を確認する
- [x] 4.3 `npx openspec validate PPP-034_add-threads-publish-retry --strict` が通る

## 5. アーカイブ時

- [ ] 5.1 archive 後、`openspec/specs/threads-posting/spec.md` の該当要件が差し替わっていることを確認する
- [ ] 5.2 `npx openspec validate --strict` が通ることを確認する
