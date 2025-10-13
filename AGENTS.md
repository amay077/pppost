# AGENTS.md / CLAUDE.md - AIエージェント指示書

※このドキュメントの内容は `AGENTS.md` と `CLAUDE.md` で常に一致させること。更新時は必ず両方を同時に修正する。

このファイルは、対応するAIエージェントがこのリポジトリで作業する際の動作規約を定義する。

## 対応するAIエージェント

- Claude（claude.ai/code）
    - 実装要求があるまでは提案や計画の共有に留める
    - 操作ログを簡潔に保持し、不要な再実行を避ける
- Codex（Codex CLI）
    - 対話環境はターミナルベースのCLIであり、`shell` 経由でコマンドを実行する
    - コマンド実行時は必ず作業ディレクトリを明示する
    - テキスト出力は簡潔にまとめ、必要な情報のみ提示する
    - 既存の指示を優先し、不要なファイル生成や過剰な修正を避ける

## 言語設定
- エージェントとの会話はすべて日本語で行う
- Gitコミットメッセージも日本語を使用する
- コミット時はチケット番号をコミットメッセージの接頭辞に付与する（例: ABCD-1234 ○○を修正）
- 用語の使用は [GLOSSARY.md](./doc/GLOSSARY.md) の定義に従う

## 共通の動作制限
- 既存ファイルの編集を優先し、新規ファイル作成は必要最小限に留める
- ドキュメントファイル（`*.md`）の作成は明示的に要求された場合のみ
- タスクは要求された内容のみを実行し、余計な作業は行わない
- 独断でのコミットは禁止し、必ず指示者の合意を得る
- 過去のコミットを書き換える操作（`git commit --amend` や履歴書き換えを伴うコマンド）は禁止し、常に通常の `git commit` を使用する

## 実装前の確認ルール
- **重要**: 指示者が明示的に指示しない限り、ソースコードの修正を禁止する
- 「実行計画を立てて」「どうすればいい？」などの質問や計画段階では、実際のコード修正を行わない
- 以下の明示的な指示があった場合に限り、ソースコードの修正を許可する：
  - 「実装して」
  - 「修正して」
  - 「コードを書いて」
  - 「作成して」
  - その他、明確に実装を要求する指示
- 計画や提案の段階では、実装内容の説明に留め、実際のコード変更は行わない

## Git コミット後の振り返り
git へコミットした後、以下を実施すること：
1. その作業で得られた学び・教訓・実行したエージェントが知らなかったことを指示者へ列挙
2. 指示者から指定された項目について適切なドキュメントへの追記・修正を提案
3. これは後学者が本プロジェクトを正しく、早く理解する助けになるものである

## コミットメッセージフォーマット
```
{PROJECT_KEY}-{TASK_ID} 変更内容の概要

- 詳細な変更点 1
- 詳細な変更点 2

🤖 Generated with {AGENT_NAME}({AGENT_URL})

Co-Authored-By: {AGENT_SIGNATURE}
```

- `PROJECT_KEY` は、プロジェクトごとに書き換えること。不明な場合は指示者に問い合わせること。
- `TASK_ID` は、タスクのID、多くは4桁程度の数値である（例: 1234）。不明な場合は指示者に問い合わせること。
- `AGENT_NAME`、`AGENT_URL`、`AGENT_SIGNATURE` はコミットを実行したエージェントに合わせて置き換えること。

## プロジェクト情報の参照先

技術的な実装や設計に関する情報は [README.md](./README.md) を起点として参照すること。
README.md には全ドキュメントへのリンクが整理されている。

## Markdown 記述時の注意
- [Markdown スタイルガイド](./docs/markdown-style-guide.md) のカーニングルールを適用すること
- これにより、プロジェクト全体で一貫した日本語表記が保たれる

## 通知ルール（作業完了通知）

### 通知必須タイミング

  - TodoWrite タスクがすべて完了 → 通知送信
  - コード実装・修正完了 → 通知送信
  - 分析・調査完了 → 通知送信
  - バグ修正完了 → 通知送信
  - ドキュメント作成完了 → 通知送信

### 通知コマンド

#### macOS の場合
  
```bash
osascript -e 'display notification "具体的な作業内容が完了しました" with title "{AIエージェント名}}" sound name "default"'
```

#### Windows の場合

```pwsh
[System.Media.SystemSounds]::Exclamation.Play()
```

### メッセージ形式

- 具体的な作業内容を含める（例: "ABC-1409 タイムスケジュール共有機能の実装が完了しました"）

### 通知不要な場合

- 単純な質疑応答、継続中の対話、部分的な進捗報告

## 対話ログ記録ルール
- **エージェントの作業が終了したら最後に** `.agents_logs/{YYYYMMDD}.md` へ、「ユーザーの指示」、「エージェントの対応」を記入すること。
- {YYYYMMDD} および、対話ログ内の日時表記は、原則として JST とする。
- 各ターンの完了前に「ログ追記済みか」を必ず自己チェックし、未実施なら直ちに記録すること。
- 記録漏れが判明した場合は、すぐにユーザーへ報告し、その場で不足分を補記すること。

対話ログの書式は次の通りとする

```
## YYYY/MM/DD HH:mm:ss
- ユーザーの指示
    1. ユーザーの指示内容(簡潔に)1
    2. ユーザーの指示内容(簡潔に)2
    3. ユーザーの指示内容(簡潔に)3...
- エージェントの対応（所要時間:◯秒または◯分） by {AIエージェント名}
    1. エージェントの対応内容(簡潔に)1
    2. エージェントの対応内容(簡潔に)2
    3. エージェントの対応内容(簡潔に)3...
----
```

## important-instruction-reminders
Do what has been asked; nothing more, nothing less.
NEVER create files unless they're absolutely necessary for achieving your goal.
ALWAYS prefer editing an existing file to creating a new one.
NEVER proactively create documentation files (*.md) or README files. Only create documentation files if explicitly requested by the User.

<!-- 以下は、Claude Code 固有の情報 -->

# SuperClaude Entry Point

@COMMANDS.md
@FLAGS.md
@PRINCIPLES.md
@RULES.md
@MCP.md
@PERSONAS.md
@ORCHESTRATOR.md
@MODES.md
