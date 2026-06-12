# Threads 長命トークンの自動リフレッシュ

## Why

PPP-009（Threads テキスト投稿）で長命トークン（60 日）を取得・保存しているが、自動リフレッシュは Non-Goal として未実装だった。現状ではトークンが 60 日で失効し、ユーザーは手動で切断→再接続する必要がある。

`SettingDataThreads.token_data` には期限判定用の `expires_in` / `obtained_at` が PPP-009 で用意済みであり（PPP-009 design.md で「後続で追加しやすくする」と明記）、これを活用して起動時の自動リフレッシュを実装する。ユーザーが 60 日以内に 1 回でもアプリを開けばトークンが維持されるようになる。

本変更は PPP-009（Threads テキスト投稿）の完了を前提とする。

## What Changes

- `### Requirement: Threads 長命トークンの自動リフレッシュ`（ADDED）を追加し、起動時のリフレッシュ条件・保存・失敗時の挙動を定義する
- `backend/netlify/functions/threads_refresh.js` を新規作成し、現在の長命トークンを `grant_type=th_refresh_token` で新しい 60 日トークンへ更新する
- `frontend/src/lib/MainContent.svelte` の `onMount` に、取得から 24 時間以上経過したトークンのリフレッシュ処理を追加する

## Non-Goals

- 失効済みトークンの自動再認可（失効時は従来通りユーザーが手動で再接続する）
- 投稿直前のリフレッシュ（起動時チェックのみ。Threads トークンは 60 日と長く、起動時更新で十分）
- Mastodon・Bluesky のトークン管理変更

## Impact

- **Dependencies**: PPP-009（Threads テキスト投稿）の完了を前提とする
- **Affected specs**: threads-posting（ADDED: 長命トークンの自動リフレッシュ）
- **Affected code**:
  - 新規: `backend/netlify/functions/threads_refresh.js`
  - 変更: `frontend/src/lib/MainContent.svelte`
- **Breaking changes**: なし（`token_data` の構造は既存のまま。接続・投稿フローに変更なし）

## References

- [実装計画](./references/plan-202606121000.md)
