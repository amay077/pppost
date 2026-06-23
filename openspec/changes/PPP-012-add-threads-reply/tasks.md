# Implementation Tasks

## 1. バックエンド: 自投稿取得（threads_posts.js）

- [x] 1.1 `backend/netlify/functions/threads_posts.js` を新規作成する（`mastodon_posts.js` のパターンを踏襲、CORS・OPTIONS プリフライト対応）
- [x] 1.2 `POST` body `{ token }` を受け、`GET https://graph.threads.net/v1.0/me/threads?fields=id,text,permalink,timestamp&limit=25&access_token=<token>` を呼ぶ
- [x] 1.3 レスポンスを `{ id, text, url, posted_at }[]` 形式（`url` は permalink、`posted_at` は timestamp）で返す
- [x] 1.4 失敗時はエラーステータスを返し、`console.error` でログ出力する

## 2. バックエンド: リプライ投稿（threads_post.js）

- [x] 2.1 body フィールドに `reply_to_id`（任意）を追加で受け取る
- [x] 2.2 `reply_to_id` が指定されている場合、トップレベルのコンテナ作成（TEXT / IMAGE / CAROUSEL 親）の API パラメータに `reply_to_id` を付与する（カルーセルの子コンテナには付与しない）
- [x] 2.3 `reply_to_id` 未指定時は従来の通常投稿フローを変更しない

## 3. フロントエンド: 投稿処理（MainContent.ts）

- [x] 3.1 `Post` 型に `id?: string` を追加する（Threads のみ使用。Mastodon・Bluesky は従来通り URL から ID 抽出）
- [x] 3.2 `loadMyPostsThreads()` を新規作成する（`POST ${Config.API_ENDPOINT}/threads_posts` に `{ token: postSettings.threads.token_data.access_token }` を送り、`Post[]`（`id` 付き）を返す）
- [x] 3.3 `loadMyPosts` の取得対象に Threads を追加する（`Promise.allSettled` の並列取得に加える。Threads の失敗が他 SNS の表示を妨げないこと）
- [x] 3.4 `postToSns` の `options.reply_to_ids` に `threads: string` を追加する
- [x] 3.5 `postToThreads(text, imageUrls, reply_to_id)` に `reply_to_id` 引数を追加し、リクエスト body に含める（未指定時は送らないか undefined のまま）
- [x] 3.6 `postToSns` の `case 'threads'` で `options?.reply_to_ids?.threads` を渡す

## 4. フロントエンド: リプライ元選択（MainContent.svelte）

- [x] 4.1 投稿時の `reply_to_ids` 構築で `threads: replyToPost?.postOfType['threads']?.id ?? ''` を追加する（`getPostId()` は使わない。design.md D1 参照）
- [x] 4.2 Threads 用の手動リプライ ID 入力欄は追加しない（Non-Goal）
- [x] 4.3 リプライ元ドロップダウンのグループ表示に Threads が含まれることを確認する（`getTypes()` は `postOfType` のキーを列挙するため変更不要の見込み）

## 5. スコープ検証（design.md D3）

- [x] 5.1 実機でリプライ投稿を行い、既存スコープ（`threads_basic,threads_content_publish`）で成功するか確認する → 権限エラー（`code: 10` "Application does not have permission"）が発生。通常投稿は成功するためリプライ作成には追加スコープが必要と判明
- [x] 5.2 `ThreadsConnection.svelte` の認可 URL の `scope` に `threads_manage_replies` を追加した（`threads_basic,threads_content_publish,threads_manage_replies`）。既存ユーザーは再接続でリプライ投稿が可能になる

## 6. 動作検証

- [x] 6.1 `cd frontend && npm run build` が型エラーなく成功することを確認する
- [ ] 6.2 リプライ元選択 UI を展開し、Threads の自投稿が候補に表示されることを確認する
- [ ] 6.3 同一内容を Mastodon・Bluesky・Threads に投稿した場合、候補で 1 グループにまとまり `(mastodon, bluesky, threads)` と表示されることを確認する
- [ ] 6.4 Threads の自投稿を選択してテキストリプライが成功し、Threads 上でリプライとして表示されることを確認する
- [ ] 6.5 画像付きリプライが成功することを確認する
- [ ] 6.6 リプライ元未選択時に通常投稿となることを確認する
- [ ] 6.7 Threads 未接続時に自投稿取得 API が呼ばれず、Mastodon・Bluesky の候補表示が従来通りであることを確認する
- [ ] 6.8 Mastodon・Bluesky へのリプライ投稿が従来通り動作することを確認する

## 7. リリース後の不具合修正

- [x] 7.1 `threads_posts.js`: 画像のみの投稿は `text` を返さないため `text: p.text ?? ''` で空文字に正規化する（`undefined.replace` で例外になりローディングが固まる不具合の発生源）
- [x] 7.2 `MainContent.svelte`: `onLoadMyPosts` を `try/finally` 化し、自投稿取得が失敗してもローディング表示を必ず解除する
- [x] 7.3 `MainContent.ts`: `groupByText` の結果を各グループの最新投稿日時で降順ソートする（SNS ごとの連結順のままだと Threads 分が末尾に残る不具合）
