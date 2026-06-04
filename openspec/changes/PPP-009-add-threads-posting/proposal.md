# Threads 投稿機能の追加（MVP: テキスト投稿）

## Why

本アプリは現在 Mastodon と Bluesky への同時投稿に対応している（Twitter (X) は [PPP-006](../archive/2026-06-03-PPP-006-remove-twitter-posting/proposal.md) で廃除済み）。投稿先 SNS を拡充するため、新たに Threads を投稿対象に追加する。

まずは最小スコープとして、Threads Graph API + Meta OAuth 2.0 を用いた**テキスト投稿のみ**を実現する。画像投稿や自投稿取得・リプライ選択は後続の proposal で扱う。これにより最小コストで Threads 対応の価値を提供する。

## What Changes

- `func.ts` に `SettingDataThreads` 型を追加し、`SettingData` ユニオン・`SettingType`・`SettingDataType` に `threads` を加える
- `config.ts` の `post_targets` に Threads 設定（`client_id`, `redirect_uri`）を追加し、env から読み込む
- `frontend/src/lib/ThreadsConnection.svelte` を新規作成し、Meta OAuth の認可ページへ遷移する接続/切断 UI を提供する
- `MainContent.svelte` の `onMount` でリダイレクト後の認可コード（`code`）を受信し、バックエンド経由で長命トークンへ交換して保存する
- `MainContent.svelte` に Threads の投稿対象チェックボックスと投稿ボタン横のアイコンを追加する
- `MainContent.ts` の `postSettings` / `postTo` に `threads` を追加し、`postToThreads()` 関数と `postToSns` の `switch` 分岐を追加する
- バックエンド `threads_token.js`（短命→長命トークン交換）と `threads_post.js`（2 段階のテキスト投稿）を新規作成する
- 環境変数を追加する（バックエンド: `PPPOST_THREADS_CLIENT_ID` / `PPPOST_THREADS_CLIENT_SECRET` / `PPPOST_THREADS_REDIRECT_URL`、フロント: `VITE_THREADS_CLIENT_ID` / `VITE_THREADS_REDIRECT_URL`）

## Non-Goals

- 画像投稿（`media_type=IMAGE`、Supabase 経由のアップロード）
- 自投稿取得・リプライ元選択・タイムライン取得
- Threads 専用の文字数カウンタ表示（500 文字上限はサーバ応答エラーとして扱う）
- 長命トークンの自動リフレッシュ（データ構造には期限判定用フィールドを持たせるが、リフレッシュ処理は実装しない）

## Impact

- **Affected specs**: threads-posting (新規)
- **Affected code**:
  - 新規: `frontend/src/lib/ThreadsConnection.svelte`, `backend/netlify/functions/threads_token.js`, `backend/netlify/functions/threads_post.js`
  - 変更: `frontend/src/lib/func.ts`, `frontend/src/lib/MainContent.ts`, `frontend/src/lib/MainContent.svelte`, `frontend/src/config.ts`
- **Breaking changes**: なし（機能追加のみ。Mastodon・Bluesky への投稿は従来通り）
