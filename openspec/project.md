# Project Context

## Purpose

PPPOST は、Twitter/X・Bluesky・Mastodon に一つの画面から同時投稿できるマルチプラットフォーム対応のソーシャルメディア投稿アプリケーション。

## Tech Stack

- フロントエンド: Svelte 4、TypeScript、Vite 5、Bootstrap 5
- バックエンド: Netlify Functions (Node.js サーバーレス)
- 認証: Twitter OAuth、Mastodon トークン、Bluesky SDK

## Project Conventions

### Code Style

- TypeScript を使用
- Svelte コンポーネント形式に従う
- 既存ファイルの編集を優先し、新規ファイル作成は最小限に留める

### Architecture Patterns

- モノレポ構成（`/frontend`、`/backend`）
- サーバーレス関数による API 実装
- ローカルストレージによる認証情報管理（現状は平文、今後暗号化予定）

### Testing Strategy

- 現状は手動テスト（`/backend/test.http`）
- 自動テストスイートは未整備

### Git Workflow

- コミットメッセージは日本語
- コミット時はチケット番号を接頭辞に付与（例: PPP-1234 ○○を修正）
- 過去のコミットを書き換える操作は禁止し、常に通常の `git commit` を使用

### OpenSpec Language Convention

本プロジェクトでは、OpenSpec の仕様ファイルにおいて以下の言語慣例を採用する：

- **見出しは英語と日本語の併記**: `#### Scenario: Same content posted to multiple SNS（同じ内容を複数 SNS に投稿）`
  - 英語見出しで OpenSpec ツールとの互換性を維持
  - 括弧内の日本語で日本語話者の理解を容易にする
- **本文は日本語**: WHEN/THEN 条件などの仕様記述は日本語で記述
- **Requirement 見出しにも適用**: `### Requirement: Post Grouping by Content（投稿の内容別グループ化）`

## Domain Context

- マルチプラットフォーム SNS 投稿
- 各 SNS の API 制限とフォーマットの違いに対応
- リプライ機能による会話の継続

## Important Constraints

- ローカルストレージに保存した接続情報が平文のまま保持される（暗号化未対応）
- Mastodon は mastodon.cloud のみ対応（他サーバーは環境変数追加で拡張可能）

## External Dependencies

- Twitter API v2
- Bluesky AT Protocol (@atproto/api)
- Mastodon API
- Supabase (画像ストレージ)
