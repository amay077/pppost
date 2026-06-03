# Twitter (X) 投稿機能の廃除（フロントエンド）

## Why

X (Twitter) API の仕様変更により、画像アップロードなどの主要機能が課金前提となり、本アプリからは現実的に利用できなくなった。直近でも Cloudflare 403 エラーへの対策を重ねてきたが、無料枠での安定運用が見込めない。そのため、フロントエンドから Twitter 投稿機能を廃除する。

なお、バックエンドの Twitter 用 Netlify Functions と `twitter-api-v2` 依存は将来の復活に備えて温存する。投稿長の目安として使っている twitter-text の文字数カウント表示も継続利用する。

## What Changes

- **BREAKING**: フロントエンドの Twitter 投稿・接続機能を削除する
  - `frontend/src/lib/TwitterConnection.svelte` を削除
  - `MainContent.svelte` / `MainContent.ts` から Twitter の投稿対象チェックボックス、接続 UI、投稿ロジック (`postToTwritter`)、自投稿取得 (`loadMyPostsTwritter`)、リプライ入力欄、グループ化の twitter 参照を削除
  - `func.ts` の `SettingDataTwitter` 型と、`SettingData` / `SettingType` / `SettingDataType` から twitter を除去
  - `config.ts` の `post_targets.twitter` 型と `VITE_TWITTER_REDIRECT_URL` 参照を削除
- **温存（変更しない）**:
  - twitter-text による文字数カウント表示（投稿長の目安として継続）
  - バックエンドの `backend/netlify/functions/twitter_*.js` と `twitter-api-v2` 依存
  - localStorage の既存 `ppp_setting_twitter`（参照されなくなるのみ。明示削除はしない）

## Impact

- **Affected specs**: sns-posting (新規)
- **Affected code**: `frontend/src/lib/TwitterConnection.svelte` (削除), `frontend/src/lib/MainContent.svelte`, `frontend/src/lib/MainContent.ts`, `frontend/src/lib/func.ts`, `frontend/src/config.ts`
- **Breaking changes**: あり。Twitter (X) への投稿ができなくなる。Mastodon・Bluesky への投稿は従来通り
