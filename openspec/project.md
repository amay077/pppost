# Project Context

このファイルは OpenSpec を使用するプロジェクトの汎用的なテンプレートです。プロジェクト固有の情報（技術スタック、ドメイン知識、依存関係など）は README.md に記載してください。

## OpenSpec Naming Conventions

proposal と spec の両方にチケット番号を付与し、課題管理システムで親子関係を管理する命名規則を採用できます。

### Change ID (Proposal ID)

- **形式**: `{PROJECT_KEY}-{TASK_ID}-{descriptive-name}`
- **例**: `ABC-005-add-user-authentication`
- **PROJECT_KEY**: プロジェクト識別子（プロジェクトごとに定義）
- **TASK_ID**: タスク番号（3桁以上の数値を推奨、例: 005）
- **descriptive-name**: kebab-case の説明的な名前（動詞で始めることを推奨: `add-`, `fix-`, `update-`, `remove-` など）

この命名により、以下が実現される：
- Proposal ID として `{PROJECT_KEY}-{TASK_ID}` 部分が識別子として機能
- change-id として全体が使用可能
- Git コミットメッセージとの整合性維持
- ディレクトリ一覧で ID と内容の両方が把握可能

### Spec Directory Name

Spec ディレクトリにも**proposal とは異なるチケット番号**を付与できます：

- **形式**: `{PROJECT_KEY}-{TASK_ID}-{descriptive-name}`
- **例**: `ABC-006-auth-ui`, `ABC-008-auth-api`
- **親子関係**: 課題管理システムで proposal を親、spec を子として管理

**構造例:**
```
openspec/changes/ABC-005-add-user-authentication/  ← proposal (親)
├── proposal.md
├── tasks.md
└── specs/
    ├── ABC-006-auth-ui/      ← spec1 (子)
    │   └── spec.md
    ├── ABC-008-auth-api/     ← spec2 (子)
    │   └── spec.md
    └── ABC-010-auth-notification/  ← spec3 (子)
        └── spec.md
```

**メリット:**
- proposal と spec の両方を課題管理システムで追跡可能
- 親子関係により依存関係が明確
- 各 spec に独立したチケット番号を割り当てることで、個別に進捗管理が可能

## OpenSpec Language Convention

多言語プロジェクトでは、以下の言語規約を採用できます：

### Proposal Files

- **セクション名は英語のみ**: `## Why`, `## What Changes`, `## Impact`
  - OpenSpec パーサーの要件により、proposal のセクション名は英語必須
- **タイトルは任意の言語**: `# ユーザー認証機能の追加` または `# Add User Authentication`
- **本文は任意の言語**: プロジェクトの主要言語で記述可能

### Spec Files

- **見出しは英語と他言語の併記可能**: `#### Scenario: User login success（ユーザーログイン成功）`
  - 英語見出しで OpenSpec ツールとの互換性を維持
  - 括弧内の他言語で母語話者の理解を容易にする
- **または英語のみ・他言語のみも可**: プロジェクトの方針による
- **本文は任意の言語**: プロジェクトの主要言語で記述可能
- **Requirement 見出しにも適用**: `### Requirement: User Authentication（ユーザー認証）`
