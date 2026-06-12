# Implementation Tasks

## 1. バックエンド: トークンリフレッシュ（threads_refresh.js）

- [ ] 1.1 `backend/netlify/functions/threads_refresh.js` を新規作成する（`threads_token.js` 同型、CORS ヘッダ対応）
- [ ] 1.2 `GET ?token=<現在の長命トークン>` を受け、`GET https://graph.threads.net/refresh_access_token?grant_type=th_refresh_token&access_token=<token>` を呼ぶ（`client_secret` 不要のため env 追加なし）
- [ ] 1.3 成功時 `{ access_token, token_type, expires_in }` を CORS ヘッダ付きで返す
- [ ] 1.4 失敗時はエラーステータスを返し、エラー内容を `console.error` でログ出力する

## 2. フロントエンド: 起動時リフレッシュ（MainContent.svelte）

- [ ] 2.1 `onMount` の Threads OAuth コールバック処理の後に、トークンリフレッシュ処理を追加する
- [ ] 2.2 `loadPostSetting('threads')` で設定を読み、未接続（null）の場合は何もしない
- [ ] 2.3 `Date.now() - token_data.obtained_at >= 24 * 60 * 60 * 1000` の場合のみ `GET ${Config.API_ENDPOINT}/threads_refresh?token=<access_token>` を呼ぶ
- [ ] 2.4 成功時: レスポンスの `access_token` / `token_type` / `expires_in` と `obtained_at: Date.now()` で `token_data` を更新し、`savePostSetting` で保存して `onChangePostSettings()` を呼ぶ
- [ ] 2.5 失敗時: `console.error` のみとし、既存の `token_data` を維持する（削除しない）

## 3. 動作検証

- [ ] 3.1 `cd frontend && npm run build` が型エラーなく成功することを確認する
- [ ] 3.2 localStorage の `ppp_setting_threads` の `obtained_at` を 25 時間前に書き換えてリロードし、`threads_refresh` が呼ばれて `access_token` / `obtained_at` が更新されることを DevTools で確認する
- [ ] 3.3 `obtained_at` が現在時刻に近い状態でリロードし、リフレッシュ API が呼ばれないことを確認する
- [ ] 3.4 リフレッシュ後に Threads へテキスト投稿が成功することを確認する（新トークンの有効性検証）
- [ ] 3.5 未接続状態（`ppp_setting_threads` なし）でリロードし、リフレッシュ API が呼ばれないことを確認する
- [ ] 3.6 Mastodon・Bluesky への投稿が従来通り動作することを確認する
