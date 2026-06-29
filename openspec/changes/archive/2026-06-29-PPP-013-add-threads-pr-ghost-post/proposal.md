# Threads PR ゴースト投稿（準定期）

## Why

ユーザーは Threads への通常投稿に便乗して、PR（宣伝）内容を **ゴースト投稿**（投稿後 24 時間で自動アーカイブされる Threads 投稿）として自動で出したい。投稿のたびに毎回出すのではなく、「前回 PR を出してから一定時間（既定 48 時間）以上経過したときのみ」付与することで、ユーザーの投稿タイミングに依存しつつも 2 日に 1 回程度に収束する「準定期」運用を実現する。

Threads API はゴースト投稿に対応している（コンテナ作成時に `is_ghost_post=true`）。ただし **テキストのみ・リプライ不可・500 文字まで** という制約があるため、PR は本投稿への「リプライ」ではなく「本投稿の直後の独立したゴースト投稿」として出す。

本変更は PPP-009〜PPP-012（いずれもアーカイブ済み）の Threads 投稿基盤の完了を前提とする。

## What Changes

- threads-posting spec に `### Requirement: Threads ゴースト投稿のバックエンド対応`（ADDED）を追加し、`is_ghost_post=true` 指定時はテキストのみのコンテナを作成して公開する要件を定義する
- threads-posting spec に `### Requirement: PR ゴースト投稿設定の管理`（ADDED）を追加し、有効/無効・間隔・PR 文リストを `localStorage` に保持する要件を定義する
- threads-posting spec に `### Requirement: PR ゴースト投稿の自動付与`（ADDED）を追加し、本投稿成功後の発火条件（Threads が投稿対象・間隔経過・PR 文あり）と PR 文のローテーションを定義する
- `backend/netlify/functions/threads_post.js`: body に `is_ghost_post`（任意）を追加で受け取り、`true` の場合は画像を無視して `media_type=TEXT` コンテナに `is_ghost_post: true` を付与する
- `frontend/src/lib/func.ts`: `PrGhostSetting` / `PrGhostState` 型と save/load 関数（`localStorage` キー `ppp_pr_ghost_setting` / `ppp_pr_ghost_state`）を追加する
- `frontend/src/lib/MainContent.ts`: `postToThreads()` に `is_ghost_post` オプションを追加し、`postToSns()` の本投稿成功後に PR ゴースト投稿の自動付与ロジックを追加する
- `frontend/src/lib/ThreadsConnection.svelte`: PR ゴースト投稿の設定 UI（有効/無効・間隔・PR 文リスト）を追加する

## Non-Goals

- PR 文のランダム選択（順番ローテーションのみ。将来拡張余地として残す）
- 他 SNS（Mastodon・Bluesky・X）への PR 付与（ゴースト投稿は Threads 専用機能のため Threads のみ）
- PR ゴースト投稿への画像添付・リプライ（API 制約によりテキストのみ・リプライ不可）
- PR 投稿のスケジューラ・バックグラウンド実行（あくまでユーザーの本投稿に便乗するフロント駆動）

## Impact

- **Dependencies**: PPP-009（テキスト投稿）・PPP-010（画像投稿）・PPP-011（トークンリフレッシュ）・PPP-012（リプライ）の完了を前提とする（すべてアーカイブ済み）
- **Affected specs**:
  - threads-posting（ADDED: ゴースト投稿のバックエンド対応 / PR ゴースト投稿設定の管理 / PR ゴースト投稿の自動付与）
- **Affected code**:
  - 変更: `backend/netlify/functions/threads_post.js`, `frontend/src/lib/func.ts`, `frontend/src/lib/MainContent.ts`, `frontend/src/lib/ThreadsConnection.svelte`
- **Breaking changes**: なし（PR 設定が無効または未設定なら従来の投稿動作と完全に同一）

## References

- [design.md](./design.md) - 必要スコープの検証方針、間隔判定とローテーションの設計、PR 投稿失敗の扱い
- [plan-202606291739.md](./references/plan-202606291739.md) - plan モードで作成した実装計画
