# Reply の Threads 対応

## Why

Mastodon・Bluesky では自投稿を取得してリプライ元として選択し、リプライ投稿できるが、Threads は PPP-009 で「自投稿取得・リプライ元選択」を Non-Goal としたため未対応のままである。Threads でも同様にリプライできるようにし、マルチ SNS 投稿体験を統一する。

threads-posting 正式 spec のテキスト投稿要件には「MVP ではリプライ先を Threads へ送信してはならない (SHALL NOT)」という制約があるため、本変更ではこの制約を解除する。

本変更は PPP-009〜PPP-011（いずれもアーカイブ済み）の完了を前提とする。

## What Changes

- threads-posting spec の `### Requirement: Threads へのテキスト投稿` を MODIFIED で取り込み、「リプライ先を送信してはならない (SHALL NOT)」制約を解除する
- `### Requirement: Threads の自投稿取得`（ADDED）を追加し、リプライ元候補として自投稿を取得・表示する要件を定義する
- `### Requirement: Threads へのリプライ投稿`（ADDED）を追加し、`reply_to_id` によるリプライ投稿と ID の取り扱い（permalink からの導出禁止）を定義する
- PPP-004-reply-selection spec のグループ化要件を MODIFIED し、対象 SNS に Threads を加える（あわせて、PPP-006 で投稿機能を廃除済みの X を対象 SNS の記載から削除する）
- `backend/netlify/functions/threads_posts.js` を新規作成し、`GET /v1.0/me/threads`（`fields=id,text,permalink,timestamp`）で自投稿を取得する
- `backend/netlify/functions/threads_post.js` に `reply_to_id` 受け取りを追加し、コンテナ作成時に Threads API へ渡す
- `frontend/src/lib/MainContent.ts`: `Post` 型に `id?: string` を追加、`loadMyPostsThreads()` 新規作成、`loadMyPosts` の対象に Threads を追加、`postToThreads()` に `reply_to_id` 引数を追加、`postToSns` の `reply_to_ids` に `threads` を追加
- `frontend/src/lib/MainContent.svelte`: 投稿時に `reply_to_ids.threads` を選択中の自投稿の `id` から構築する

## Non-Goals

- Threads 用の手動リプライ ID 入力欄（Threads の permalink からは API の投稿 ID を導出できないため、自投稿選択のみ対応。Mastodon・Bluesky の手動入力欄は従来通り）
- 他人の投稿へのリプライ、リプライの閲覧・管理（`threads_read_replies` / `threads_manage_replies` を要する機能）
- タイムライン取得

## Impact

- **Dependencies**: PPP-009（テキスト投稿）・PPP-010（画像投稿）・PPP-011（トークンリフレッシュ）の完了を前提とする（すべてアーカイブ済み）
- **Affected specs**:
  - threads-posting（MODIFIED: テキスト投稿要件 / ADDED: 自投稿取得・リプライ投稿）
  - PPP-004-reply-selection（MODIFIED: グループ化対象 SNS に Threads を追加）
- **Affected code**:
  - 新規: `backend/netlify/functions/threads_posts.js`
  - 変更: `backend/netlify/functions/threads_post.js`, `frontend/src/lib/MainContent.ts`, `frontend/src/lib/MainContent.svelte`
- **Breaking changes**: なし（リプライ未選択時の投稿・他 SNS の動作は従来通り）

## References

- [design.md](./design.md) - reply_to_id の ID 種別、必要スコープの検証方針
