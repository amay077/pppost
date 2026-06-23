# Design: Reply の Threads 対応

## D1: reply_to_id は API の投稿 ID を使用（permalink から導出しない）

Mastodon・Bluesky は投稿 URL の末尾セグメントが API の投稿 ID と一致するため、既存実装は `getPostId()` で URL から ID を抽出している。

**Threads はこのパターンが使えない**。permalink（`https://www.threads.net/@{user}/post/{shortcode}`）の末尾はショートコードであり、リプライ作成時の `reply_to_id` に必要な数値の投稿 ID とは異なる。

対応: 自投稿取得 API（`GET /me/threads?fields=id,text,permalink,timestamp`）が返す `id` をフロントの `Post` 型に保持し（`id?: string` をオプショナル追加）、リプライ投稿時は `replyToPost.postOfType['threads'].id` を直接使用する。`getPostId()` は Threads には適用しない。

この制約により、Threads の手動リプライ ID 入力欄は設けない（ユーザーが投稿 ID を知る手段がないため）。

## D2: リプライ投稿の API 呼び出し

リプライはコンテナ作成（`POST /me/threads`）に `reply_to_id` パラメータを追加するだけで、公開（`threads_publish`)以降のフローは通常投稿と同一。テキスト・単画像・カルーセルのいずれでも、トップレベルのコンテナ（カルーセルの場合は親コンテナ）に `reply_to_id` を付与する。

## D3: 必要スコープ（実機検証で確定）

自投稿取得（`GET /me/threads`）は既存の `threads_basic` スコープで可能。

リプライ作成は当初 `threads_content_publish` で可能と想定したが、**実機検証で権限エラー（`code: 10` "Application does not have permission"）が発生した**。通常投稿（テキスト/画像）は `threads_content_publish` で成功する一方、`reply_to_id` 付きコンテナ作成のみ失敗したことから、リプライ作成には `threads_manage_replies` スコープが必要と確定した。

対応として `ThreadsConnection.svelte` の認可 URL の `scope` を `threads_basic,threads_content_publish,threads_manage_replies` に変更する。既存の接続済みユーザーは旧スコープのトークンのままなので、リプライを使うには再接続（再認可）が必要。通常投稿は旧トークンでも従来通り動作するため接続状態は壊れない。

Meta アプリ側では、テスターとして登録済みのアカウントは Standard Access として App Review なしで `threads_manage_replies` を利用できる（アプリのユースケース/権限でスコープが有効化されていることが前提）。

## D4: 自投稿取得のバックエンド API 形式

既存の `mastodon_posts.js` のパターン（POST で認証情報を受け、`{ text, url, posted_at }[]` を返す）を踏襲する:

- リクエスト: `POST /threads_posts`、body `{ token }`（`user_id` は不要。`/me/threads` がトークンから解決）
- レスポンス: `{ id, text, url, posted_at }[]`（`url` は permalink。`id` は D1 のため必須で返す）
- 取得件数は他 SNS と同程度（25 件目安）とし、`limit` パラメータで指定する
