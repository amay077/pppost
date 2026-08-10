# Implementation Tasks

## 1. 仕様

- [x] 1.1 `threads-posting` spec の「Threads の自投稿取得」Requirement を更新し、`GET /me/replies` の取得と返信の候補への包含、部分失敗時の扱いを規定する

## 2. 実装（threads_posts.js）

- [x] 2.1 トップレベル投稿取得（`GET /me/threads`、`fields=id,text,permalink,timestamp&limit=25`）と返信取得（`GET /me/replies`、同フィールド）の 2 エンドポイントを呼び出す
- [x] 2.2 両方の取得成功時はマージし、投稿 `id` による重複除去をして返す
- [x] 2.3 一方の取得に失敗した場合は成功した側の結果のみを返し、両方失敗した場合のみエラーを返す

## 3. 検証

- [x] 3.1 `openspec validate PPP-039-include-threads-replies-in-candidates --strict` が成功する
- [ ] 3.2 実機で、返信として投稿した Threads 投稿がリプライ元候補に表示され、同一内容の Bluesky・Misskey 投稿と同じグループにまとまることを確認する（Issue #39 の再発防止確認）
