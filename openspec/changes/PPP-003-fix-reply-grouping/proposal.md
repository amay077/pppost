# Fix Reply Selection Grouping（リプライ選択グループ化の修正）

## Why（背景）

リプライ元選択ドロップダウンで、同一内容の投稿が複数の SNS（X/Mastodon/Bluesky）に投稿されているにもかかわらず、期待通りにグループ化されず、一部の SNS だけが別の選択肢として表示される不具合がある。これにより、ユーザーが同じ投稿を複数回選択しなければならず、UX が低下している。

## What Changes（変更内容）

- 投稿のグループ化ロジックを改善し、テキストの最初の10文字ではなく、正規化されたテキスト全体をキーとしてグループ化する
- 時刻フォーマットのバグを修正（`H:MM` → `H:mm`）

## Impact（影響範囲）

- 影響を受けるスペック: `reply-selection`（新規作成）
- 影響を受けるコード: `frontend/src/lib/MainContent.ts:96-112`（`groupByText` 関数）、`frontend/src/lib/MainContent.ts:103`（時刻フォーマット）
