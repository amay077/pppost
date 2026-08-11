# Threads の返信投稿をリプライ元候補に含める

## Why

`backend/netlify/functions/threads_posts.js` は `GET /me/threads` のみを呼んでおり、Threads API の仕様上このエンドポイントは**トップレベル投稿のみ**を返して**返信（リプライ）は含まない**（Meta 公式ドキュメント "Retrieve User Posts" に「返信を取得するには Retrieve User Replies を参照」と明記）。リプライは別エンドポイント `GET /me/replies` で取得する必要がある。このため、返信として投稿した内容（例: クロス投稿した返信）がリプライ元候補に表示されず、Bluesky（`getAuthorFeed` 既定でリプライを含む）・Misskey（`withReplies: true`）と母集合が不一致となり、`PPP-004-reply-selection` のグループ化からも欠落する（Issue #39）。

## What Changes

- `backend/netlify/functions/threads_posts.js` が、`GET /me/threads`（トップレベル投稿）に加えて `GET /me/replies`（返信投稿）を取得し、両者の結果をマージして返す
- 取得フィールドは既存と同じ `id,text,permalink,timestamp` とし、`limit=25` を維持する
- いずれか一方の取得が失敗した場合は、成功した側の結果のみを返す（両方失敗した場合のみエラー）
- 万一の重複に備え、投稿 `id` による重複除去を行う
- `GET /me/replies` には Threads API の `threads_read_replies` スコープが必要なため、OAuth 認可スコープ（`frontend/src/lib/ThreadsConnection.svelte`）に追加する。**既存の接続トークンには新スコープが付与されないため、再接続（再認可）が必要**
- フロントエンドの変更は認可スコープの 1 行のみ（`loadMyPostsThreads` は配列をそのまま消費し、グループ化・ソートは既存ロジックのまま）

## Impact

- **Affected specs**: `threads-posting`（MODIFIED: Threads アカウント接続 / Threads の自投稿取得）
- **Affected code**: `backend/netlify/functions/threads_posts.js`、`frontend/src/lib/ThreadsConnection.svelte`（認可スコープ）
- **Breaking changes**: なし（ただし既存トークンでは `threads_read_replies` が無効なため、機能確認には Threads の再接続が必要）

## References

- [Issue #39](https://github.com/amay077/pppost/issues/39)
- [Meta Threads API: Retrieve User Posts](https://developers.facebook.com/docs/threads/retrieve-and-discover-posts/retrieve-posts)（`GET /{threads-user-id}/threads` はトップレベル投稿のみ。返信は Retrieve User Replies を参照）
- [Meta Threads API: Retrieve User Replies](https://developers.facebook.com/docs/threads/retrieve-and-manage-replies/retrieve-replies)（`GET /{threads-user-id}/replies` で返信一覧を取得）
