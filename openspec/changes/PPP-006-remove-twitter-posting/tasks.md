# Implementation Tasks

## 1. Twitter 接続コンポーネントの削除

- [ ] 1.1 `frontend/src/lib/TwitterConnection.svelte` を削除する

## 2. MainContent.svelte からの Twitter 参照削除

- [ ] 2.1 `import TwitterConnection` と `<TwitterConnection on:onChange={...} />` を削除
- [ ] 2.2 投稿対象選択の Twitter チェックボックス (`bind:checked={postTo.twitter}`) を削除
- [ ] 2.3 投稿ボタン内の Twitter SVG アイコン表示 (`{#if postSettings.twitter != null && postTo.twitter}` ブロック) を削除
- [ ] 2.4 リプライ入力欄 (`replyToIdForTwitter` の宣言・リセット・入力欄・アイコン) を削除
- [ ] 2.5 `postSettings.twitter` の更新処理 (`onChangePostSettings` 内) を削除
- [ ] 2.6 `postOfType` / `reply_to_ids` の twitter 初期化・参照を削除
- [ ] 2.7 twitter-text の文字数カウント (`tweetLength` / `TWITTER_WARN_LENGTH`) と文字数表示は **残す**

## 3. MainContent.ts からの Twitter 参照削除

- [ ] 3.1 `SettingDataTwitter` の import を削除
- [ ] 3.2 `postSettings` の `twitter` プロパティと `loadPostSetting('twitter')` を削除
- [ ] 3.3 `postTo` の `twitter` 初期化を削除
- [ ] 3.4 自投稿取得の `'twitter'` 分岐と `loadMyPostsTwritter` を削除
- [ ] 3.5 投稿処理の `postToTwritter` 呼び出しと関数定義を削除
- [ ] 3.6 投稿グループ化 (`postOfType` / マッピング) の twitter 参照を削除
- [ ] 3.7 `reply_to_ids` 型の `twitter` を削除

## 4. 型定義・設定からの Twitter 除去

- [ ] 4.1 `func.ts` の `SettingDataTwitter` 型を削除
- [ ] 4.2 `func.ts` の `SettingData` ユニオン・`SettingType`・`SettingDataType` から twitter を除去する。
  - 特に `SettingDataType` 条件型の else 分岐（フォールバック）は現状 `SettingDataTwitter` (L41) になっているため、単純に `SettingDataTwitter` を消すと条件型が壊れる。else 分岐を `SettingDataBluesky`（または `never`）へ置き換えること。
  - `SettingType = SettingData['type']` はユニオン縮小により自動的に `'mastodon' | 'bluesky'` になる。
- [ ] 4.3 `config.ts` の `post_targets.twitter` を削除する。型定義 (`ConfigType.post_targets.twitter`, L9-12) と `Config` 実体生成の twitter ブロック (L32-34, `VITE_TWITTER_REDIRECT_URL` 参照) の双方を削除すること。コメントアウト済み旧 config (L56-57, L79 付近) は死コードのため対象外（任意で整理）。

## 5. 温存対象の確認（削除しないこと）

- [ ] 5.1 `backend/netlify/functions/twitter_*.js` を残していることを確認
- [ ] 5.2 `package.json` の `twitter-api-v2` / `twitter-text` 依存を残していることを確認

## 6. 動作検証

- [ ] 6.1 `cd frontend && npm run build` が型エラーなく成功することを確認
- [ ] 6.2 投稿対象選択の Twitter チェックボックスと接続 UI (TwitterConnection) の双方が表示されないことを確認
- [ ] 6.3 Mastodon・Bluesky への投稿が従来通り動作することを確認
- [ ] 6.4 文字数カウント表示が従来通り表示されることを確認
