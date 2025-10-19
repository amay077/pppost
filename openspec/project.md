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

### OpenSpec Naming Conventions

本プロジェクトでは、proposal と spec の両方にチケット番号を付与し、課題管理システムで親子関係を管理する。

#### Change ID (Proposal ID)

- **形式**: `{PROJECT_KEY}-{TASK_ID}-{descriptive-name}`
- **例**: `PPP-005-add-threads-support`
- **PROJECT_KEY**: プロジェクト識別子（本プロジェクトは `PPP`）
- **TASK_ID**: タスク番号（3桁以上の数値、例: 005）
- **descriptive-name**: kebab-case の説明的な名前（動詞で始めることを推奨: `add-`, `fix-`, `update-`, `remove-` など）

この命名により、以下が実現される：
- Proposal ID として `PPP-005` 部分が識別子として機能
- change-id として `PPP-005-add-threads-support` 全体が使用可能
- Git コミットメッセージ（`PPP-005 変更内容`）との整合性維持
- ディレクトリ一覧で ID と内容の両方が把握可能

#### Spec Directory Name

Spec ディレクトリにも**proposal とは異なるチケット番号**を付与する：

- **形式**: `{PROJECT_KEY}-{TASK_ID}-{descriptive-name}`
- **例**: `PPP-006-threads-ui`, `PPP-008-threads-api`
- **親子関係**: 課題管理システムで proposal を親、spec を子として管理

**構造例:**
```
openspec/changes/PPP-005-add-threads-support/  ← proposal (親)
├── proposal.md
├── tasks.md
└── specs/
    ├── PPP-006-threads-ui/      ← spec1 (子)
    │   └── spec.md
    ├── PPP-008-threads-api/     ← spec2 (子)
    │   └── spec.md
    └── PPP-010-threads-notification/  ← spec3 (子)
        └── spec.md
```

**メリット:**
- proposal と spec の両方を課題管理システムで追跡可能
- 親子関係により依存関係が明確
- 各 spec に独立したチケット番号を割り当てることで、個別に進捗管理が可能

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
