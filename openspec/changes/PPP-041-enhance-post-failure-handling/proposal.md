# 投稿失敗時の原因表示の強化とタイムアウトリトライ

## Why

投稿失敗時にユーザーへ通知されるのは `alert("Blueskyに投稿できませんでした。")` のような SNS 名のみであり、**なぜ失敗したのかが伝わらない**。原因（HTTP ステータスコード・エラーメッセージ）は `postToXxx` 内で `console.error` に出力されるだけで破棄されており、ユーザーは対処（認証のやり直し・時間を置いて再投稿など）を判断できない。

また、フロントエンドの `fetch` にタイムアウト設定がなく（AbortController 不使用）、バックエンド（Netlify Functions）の応答待ちやネットワーク不調時に無期限に待機しうる。タイムアウトは一時的な障害であることが多く自動リトライが有効だが、現状はリトライの仕組みもない。

## What Changes

- 投稿失敗時の原因表示を `alert` から画面内のインライン表示に変更し、SNS 名と原因（分類）をリスト表示する
- 投稿 API（`bluesky_post` / `threads_post` / `misskey_post`）と R2 アップロードの `fetch` にタイムアウトを導入し、タイムアウトを `AbortError` として検知する
- 動画 finalize ポーリング（`bluesky_video_finalize` / `threads_video_finalize` / `misskey_video_finalize`）の最大試行回数到達をタイムアウトとして扱う
- タイムアウト（およびネットワークエラー）の場合のみ、SNS ごとに **1 回** リトライする。2 回目も失敗した場合は原因と共にエラー表示する
- 失敗原因を分類する: `timeout`（タイムアウト）/ `network`（ネットワークエラー）/ `auth`（401）/ `server`（5xx）/ `rejected`（その他 4xx）
- `postToXxx` の戻り値を `boolean` から原因情報を含む型に変更し、`postToSns` が SNS ごとの原因を返すようにする
- バックエンドのエラーレスポンスが平文のものは、可能な範囲で JSON に統一する（軽微な変更に留める）

## Impact

- **Affected specs**:
  - `posting-ui`（インラインエラー表示を ADDED）
  - `sns-posting`（エラー分類・伝播とタイムアウトリトライを ADDED）
  - `video-posting`（動画投稿失敗時のエラー通知にポーリングタイムアウト時のリトライを MODIFIED）
- **Affected code**:
  - `frontend/src/lib/MainContent.ts`（`postToSns` / `postToBluesky` / `postToThreads` / `postToMisskey` / finalize ポーリング各関数）
  - `frontend/src/lib/MainContent.svelte`（`post()` のエラー表示部）
  - `frontend/src/lib/storage-client.ts`（R2 アップロードのタイムアウト）
  - `backend/netlify/functions/*`（エラーレスポンスの JSON 統一、軽微）
- **Breaking changes**: なし（フロントエンド内部の型変更のみ。API エンドポイントの仕様変更なし）
