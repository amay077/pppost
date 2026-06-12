# Design: Reply の Threads 対応

## D1: reply_to_id は API の投稿 ID を使用（permalink から導出しない）

Mastodon・Bluesky は投稿 URL の末尾セグメントが API の投稿 ID と一致するため、既存実装は `getPostId()` で URL から ID を抽出している。

**Threads はこのパターンが使えない**。permalink（`https://www.threads.net/@{user}/post/{shortcode}`）の末尾はショートコードであり、リプライ作成時の `reply_to_id` に必要な数値の投稿 ID とは異なる。

対応: 自投稿取得 API（`GET /me/threads?fields=id,text,permalink,timestamp`）が返す `id` をフロントの `Post` 型に保持し（`id?: string` をオプショナル追加）、リプライ投稿時は `replyToPost.postOfType['threads'].id` を直接使用する。`getPostId()` は Threads には適用しない。

この制約により、Threads の手動リプライ ID 入力欄は設けない（ユーザーが投稿 ID を知る手段がないため）。

## D2: リプライ投稿の API 呼び出し

リプライはコンテナ作成（`POST /me/threads`）に `reply_to_id` パラメータを追加するだけで、公開（`threads_publish`)以降のフローは通常投稿と同一。テキスト・単画像・カルーセルのいずれでも、トップレベルのコンテナ（カルーセルの場合は親コンテナ）に `reply_to_id` を付与する。

## D3: 必要スコープの検証（Open Question）

自投稿取得（`GET /me/threads`）は既存の `threads_basic` スコープで可能。

リプライ作成は `threads_content_publish` で可能と想定するが、Meta のドキュメントには Reply Management API として `threads_manage_replies` の記載もあり、自投稿へのリプライ作成にどこまで要求されるかはドキュメント上明確でない。実機検証で権限エラー（PPP-009 で経験した `code: 100, error_subcode: 10` 系）が発生した場合は、`ThreadsConnection.svelte` の認可 URL の `scope` に `threads_manage_replies` を追加し、ユーザーに再接続を促す（tasks.md に検証タスクとして明記）。

## D4: 自投稿取得のバックエンド API 形式

既存の `mastodon_posts.js` のパターン（POST で認証情報を受け、`{ text, url, posted_at }[]` を返す）を踏襲する:

- リクエスト: `POST /threads_posts`、body `{ token }`（`user_id` は不要。`/me/threads` がトークンから解決）
- レスポンス: `{ id, text, url, posted_at }[]`（`url` は permalink。`id` は D1 のため必須で返す）
- 取得件数は他 SNS と同程度（25 件目安）とし、`limit` パラメータで指定する
