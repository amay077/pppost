# Implementation Tasks

## 1. 型定義（func.ts）

- [ ] 1.1 `SettingDataThreads` 型を追加する（`type: 'threads'`, `title: 'Threads'`, `enabled`, `user_id`, `token_data: { access_token, token_type, expires_in, obtained_at }`）。既存の `SettingDataMastodon`/`SettingDataBluesky` に倣い `title` リテラルを持たせる
- [ ] 1.2 `SettingData` ユニオンに `SettingDataThreads` を追加する
- [ ] 1.3 `SettingType` に `'threads'` を追加する
- [ ] 1.4 `SettingDataType<T>` の条件型に `T extends 'threads' ? SettingDataThreads :` を追加する
- [ ] 1.5 `savePostSetting` / `loadPostSetting` は型駆動のため変更不要であることを確認する（`localStorage` キーは自動的に `ppp_setting_threads`）

## 2. 設定（config.ts）

- [ ] 2.1 `post_targets` に `threads: { client_id: string, redirect_uri: string }` を追加する
- [ ] 2.2 `import.meta.env.VITE_THREADS_CLIENT_ID` / `VITE_THREADS_REDIRECT_URI` から値を読み込む
- [ ] 2.3 `client_secret` はフロントに置かないことを確認する（バックエンド env のみ）

## 3. 接続 UI（ThreadsConnection.svelte）

- [ ] 3.1 `frontend/src/lib/ThreadsConnection.svelte` を新規作成する（`MastodonConnection.svelte` の折りたたみ構造を踏襲）
- [ ] 3.2 接続ボタン押下で `https://threads.net/oauth/authorize`（`client_id`, `redirect_uri`, `response_type=code`, `scope=threads_basic,threads_content_publish`, `state=threads_callback`）へ `window.location.href` で同一タブ遷移する
- [ ] 3.3 Mastodon の手動コード貼り付け UI は設けない（リダイレクトで自動取得するため）
- [ ] 3.4 接続済み表示と切断ボタンを設け、切断で `deletePostSetting('threads')` + `dispatch('onChange')` を行う

## 4. コールバック・UI 統合（MainContent.svelte）

- [ ] 4.1 `import ThreadsConnection from "./ThreadsConnection.svelte"` を追加する
- [ ] 4.2 `onMount` で `state === 'threads_callback'` かつ `code` がある場合に `GET ${Config.API_ENDPOINT}/threads_token?code=<code>` を呼ぶ
- [ ] 4.3 レスポンス（`user_id`, 長命 `access_token`, `token_type`, `expires_in`）を `savePostSetting`（`obtained_at: Date.now()` 付き）で保存し、`onChangePostSettings()` を呼ぶ
- [ ] 4.4 `history.replaceState` で URL から `code` を除去する
- [ ] 4.5 Mastodon/Bluesky と並べて Threads の投稿対象チェックボックス（`bind:checked={postTo.threads}`, `disabled={postSettings.threads == null}`）と `<ThreadsConnection on:onChange={onChangePostSettings} />` を追加する
- [ ] 4.6 投稿ボタン横に Threads アイコンを `{#if postSettings.threads != null && postTo.threads}` で追加する
- [ ] 4.7 `onChangePostSettings` に `postSettings.threads = loadPostSetting('threads')` を追加する
- [ ] 4.8 `postOfType` / `replyToPost` の初期化箇所すべてに `threads: undefined` を追加する（`SettingType` 型網羅のため。リプライ UI 自体は追加しない）

## 5. 投稿処理（MainContent.ts）

- [ ] 5.1 `postSettings` に `threads: loadPostSetting('threads')` を追加する
- [ ] 5.2 `postTo` に `threads: postSettings?.threads?.enabled ?? false` を追加する
- [ ] 5.3 `postToThreads(text: string): Promise<boolean>` を追加する（`POST ${Config.API_ENDPOINT}/threads_post` に `{ user_id, token, text }` を送り `res.ok` を返す。画像・reply_to は渡さない）
- [ ] 5.4 `postToSns` の `switch` に `case 'threads'` を追加し、失敗時 `errors.push('Threads')` とする
- [ ] 5.5 `postOfType` 初期化に `threads: undefined` を追加する（型網羅）
- [ ] 5.6 `loadMyPosts` の `switch` には Threads を追加しない（自投稿取得は対象外）

## 6. バックエンド: トークン交換（threads_token.js）

- [ ] 6.1 `backend/netlify/functions/threads_token.js` を新規作成する（`mastodon_token.js` 同型、CORS 対応）
- [ ] 6.2 `GET ?code=<code>` を受け、`POST https://graph.threads.net/oauth/access_token`（`grant_type=authorization_code`）で短命トークンと `user_id` を取得する
- [ ] 6.3 `GET https://graph.threads.net/access_token`（`grant_type=th_exchange_token`）で長命トークンへ交換する
- [ ] 6.4 `{ user_id, access_token, token_type, expires_in }` を CORS ヘッダ付きで返す
- [ ] 6.5 env `PPPOST_THREADS_CLIENT_ID` / `PPPOST_THREADS_CLIENT_SECRET` / `PPPOST_THREADS_REDIRECT_URI` を使用する

## 7. バックエンド: 投稿（threads_post.js）

- [ ] 7.1 `backend/netlify/functions/threads_post.js` を新規作成する（OPTIONS プリフライト対応、CORS 対応）
- [ ] 7.2 body `{ user_id, token, text }` を受ける
- [ ] 7.3 `POST https://graph.threads.net/v1.0/${user_id}/threads`（`media_type=TEXT`, `text`, `access_token`）でコンテナを作成し `creation_id` を得る
- [ ] 7.4 `POST https://graph.threads.net/v1.0/${user_id}/threads_publish`（`creation_id`, `access_token`）で公開する
- [ ] 7.5 いずれかが失敗した場合はエラーステータスを返す（フロントの `errors` 経路で通知）

## 8. 環境変数

- [ ] 8.1 `backend/.env.example` に `PPPOST_THREADS_CLIENT_ID` / `PPPOST_THREADS_CLIENT_SECRET` / `PPPOST_THREADS_REDIRECT_URI` を追記する
- [ ] 8.2 フロントの env に `VITE_THREADS_CLIENT_ID` / `VITE_THREADS_REDIRECT_URI` を追記する（フロントには `.env.example` が存在せず `frontend/.env` のみのため、`frontend/.env` に追記する。必要に応じて `frontend/.env.example` を新規作成してもよい）
- [ ] 8.3 `redirect_uri` がフロント（`VITE_THREADS_REDIRECT_URI`）とバックエンド（`PPPOST_THREADS_REDIRECT_URI`）で同値であることを確認する

## 9. 動作検証

- [ ] 9.1 `cd frontend && npm run build` が型エラーなく成功することを確認する
- [ ] 9.2 接続ボタン → Meta 認可 → リダイレクトで長命トークンが保存され「接続済み」表示になることを確認する
- [ ] 9.3 Threads チェックボックス ON でテキスト投稿が成功することを確認する
- [ ] 9.4 切断後にチェックボックスが無効化されることを確認する
- [ ] 9.5 未接続時に Threads チェックボックスが無効であることを確認する
- [ ] 9.6 500 文字超過時に Threads 投稿が失敗し、エラー一覧に `Threads` が含まれることを確認する
- [ ] 9.7 Mastodon・Bluesky への投稿が従来通り動作することを確認する
