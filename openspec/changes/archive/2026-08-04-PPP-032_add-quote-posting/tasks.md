# Implementation Tasks

## 1. バックエンド: Threads の引用投稿

- [x] 1.1 `backend/netlify/functions/threads_post.js` に `quote_to_id` を受け取るパラメータを追加する
- [x] 1.2 リクエストに `quote_to_id` が含まれる場合、コンテナ作成パラメータに `quote_post_id` を付与する（TEXT / IMAGE / CAROUSEL 親コンテナ。カルーセル子コンテナには付与しない）
- [x] 1.3 `quote_to_id` 未指定時は既存の投稿フローを変更しない

## 2. バックエンド: Bluesky の引用投稿

- [x] 2.1 `backend/netlify/functions/bluesky_post.js` に `quote_to_id`（post rkey）を受け取るパラメータを追加する
- [x] 2.2 引用元の uri / cid を解決する（reply の解決ロジックを流用）。解決失敗時は 400 を返し、通常投稿にフォールバックしない
- [x] 2.3 引用のみ → `app.bsky.embed.record`、引用+画像 → `app.bsky.embed.recordWithMedia`（media: images）、引用+OGP → `app.bsky.embed.recordWithMedia`（media: external）を組み立てる
- [x] 2.4 引用元未指定時は既存の投稿フロー（画像・OGP・通常投稿）を変更しない

## 3. バックエンド: Misskey の引用投稿

- [x] 3.1 `backend/netlify/functions/misskey_post.js` に `quote_to_id` を受け取るパラメータを追加する
- [x] 3.2 `notes/create` の body に `renoteId` を追加する（`fileIds` と併用可能）
- [x] 3.3 引用元未指定時は既存の投稿フローを変更しない

## 4. フロントエンド: postToSns の拡張

- [x] 4.1 `frontend/src/lib/MainContent.ts` の `postToSns` の options に `quote_to_ids` を追加する（`reply_to_ids` と同構造）
- [x] 4.2 各 `postTo*` 関数の引数に `quote_to_id` を追加し、呼び出し側に渡す

## 5. フロントエンド: Manual reply の廃止

- [x] 5.1 `frontend/src/lib/MainContent.svelte` から `replyToIdForBluesky` / `replyToIdForMisskey` 変数を削除する
- [x] 5.2 リプライ元ドロップダウンの「Manual reply」オプションと手動入力 UI（`- OR -` 以降の入力欄ブロック）を削除し、「（選択しない）」オプションに置き換える
- [x] 5.3 `post()` のリプライ元 ID 解決から手動入力フォールバックを削除する
- [x] 5.4 投稿成功時・Clear 時のリセット処理から手動入力変数のリセットを削除する

## 6. フロントエンド: 引用 UI の追加

- [x] 6.1 `frontend/src/lib/MainContent.svelte` に `quoteToPost` 変数と `expandedQuote` を追加する
- [x] 6.2 Reply セクションと同型の Quote セクション（展開トグル → 自投稿ドロップダウン選択、手動入力なし）を追加する
- [x] 6.3 リプライ元と引用元の排他制御を実装する（一方を選択したら他方をリセット）
- [x] 6.4 `post()` で `quote_to_ids` を組み立てる（Threads は取得済み `id`、他 SNS は URL 末尾のパスセグメントを ID 導出）
- [x] 6.5 投稿成功時・Clear 時に引用元もリセットする

## 7. 検証

- [x] 7.1 `npm run check` が成功する（既存エラー 3 件のみで、追加エラーがないこと）
- [x] 7.2 `npm run build` が成功する
- [ ] 7.3 実機確認: 各 SNS でテキストのみの引用投稿ができる（Bluesky / Threads / Misskey）
- [ ] 7.4 実機確認: 各 SNS で画像+引用の同時投稿ができる（Bluesky は recordWithMedia / Threads の IMAGE と CAROUSEL / Misskey）
- [ ] 7.5 実機確認: リプライ元の手動入力欄が表示されず、ドロップダウン選択のみでリプライできる
- [ ] 7.6 実機確認: リプライと引用を同時に選択できない
