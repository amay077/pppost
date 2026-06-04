# Implementation Tasks

## 1. バックエンド: 画像投稿（threads_post.js）

- [x] 1.1 `event.body` から body フィールド `images: string[]`（Supabase 公開 URL 配列）を受け取る（既存の body フィールド `user_id` / `token` / `text` と同階層）。以降、Threads API へ渡すパラメータ（`image_url` / `media_type` / `access_token`）とは区別する
- [x] 1.2 `images` が空または未指定の場合は既存のテキスト投稿フロー（`media_type=TEXT`）をそのまま実行する
- [x] 1.3 `images.length` が 11 以上の場合は Threads API を呼ばずにエラーステータスを返す（上限超過）
- [x] 1.4 `images` が 1 枚の場合: `POST /me/threads`（API パラメータ `media_type=IMAGE`, `image_url`, `text`, `access_token`）でコンテナを作成し、`POST /me/threads_publish`（`creation_id`, `access_token`）で公開する
- [x] 1.5 `images` が 2 枚以上 10 枚以下の場合:
  - 各画像で `POST /me/threads`（`media_type=IMAGE`, `image_url`, `access_token`）の子コンテナを並列作成し `creation_id` 一覧を得る。子コンテナのいずれか 1 つでも作成に失敗した場合は投稿全体を失敗として中断する
  - `POST /me/threads`（`media_type=CAROUSEL`, `children={ids}`, `text`, `access_token`）で親コンテナを作成する
  - `POST /me/threads_publish`（`creation_id`, `access_token`）で公開する
- [x] 1.6 子コンテナ作成・親コンテナ作成・公開・上限超過のいずれかが失敗した場合はエラーステータスを返し、フロントエンドがエラー一覧に `Threads` を含められるようにする

## 2. フロントエンド: 投稿処理（MainContent.ts）

- [x] 2.1 `postToThreads(text: string, imageUrls: string[])` に `imageUrls` 引数を追加する
- [x] 2.2 `postToSns` の `case 'threads'` で `postToThreads(text, uploadedImageUrls)` と渡すよう変更する
- [x] 2.3 バックエンドへのリクエスト body に `images: imageUrls` を追加する（既存の body フィールド `user_id` / `token` / `text` と同階層）
- [x] 2.4 `postToThreads` が失敗（`false`）を返した場合、既存のエラー集約処理でエラー一覧に `Threads` を含める（上限超過・コンテナ作成失敗・公開失敗を含む）

## 3. 動作検証

- [x] 3.1 `cd frontend && npm run build` が型エラーなく成功することを確認する
- [ ] 3.2 画像 1 枚付き投稿が Threads に反映されることを確認する
- [ ] 3.3 画像 2 枚以上付き投稿がカルーセルとして Threads に反映されることを確認する
- [ ] 3.4 テキストのみ投稿が従来通り動作することを確認する
- [ ] 3.5 画像 11 枚添付時に Threads 投稿が失敗し、エラー一覧に `Threads` が含まれることを確認する
- [ ] 3.6 子コンテナ作成・公開のいずれかが失敗した場合にエラー一覧に `Threads` が含まれることを確認する
- [ ] 3.7 Mastodon・Bluesky への投稿が従来通り動作することを確認する
