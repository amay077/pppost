# Threads のハッシュタグ（#削除）を吸収するテキスト正規化の追加

## Why

Threads に `#XXX` と投稿すると、Threads 側の仕様で `#` がカテゴリ化され投稿文から削除される。そのため、他 SNS（`#` 付きのまま）と Threads（`#` なし）で正規化テキストが不一致になり、reply 一覧のグループ化で Threads の投稿だけ別グループに表示されてしまう（Issue #30）。

## What Changes

- `frontend/src/lib/MainContent.ts` の `normalizeText` にハッシュタグの `#` 記号除去を追加する
  - `#` に続くキーワードがある場合、`#` 記号のみを除去する（キーワードは残す）
  - URL 除去の後に適用する（URL のフラグメント `#` は URL と一緒に除去済みのため）
- 比較キー生成のみに影響し、表示テキスト（`trimmed_text`）は元テキストのまま
- 全 SNS に共通の正規化として適用する（Threads 特有の分岐はしない）
  - Threads は `#` のみをカテゴリ化で削除するため、キーワードを残して `#` を除去することで、Threads が「初出のハッシュタグのみ削除」でも「すべて削除」でも吸収できる

## Impact

- **Affected specs**: `PPP-004-reply-selection`（Requirement: グループ化のためのテキスト正規化）
- **Affected code**: `frontend/src/lib/MainContent.ts`（`normalizeText`）
- **Breaking changes**: なし
- **Trade-off**: `#` の有無のみが異なる投稿（例: `#朝活 今日の投稿` と `朝活 今日の投稿`）は同一グループになる（Threads の `#` 削除に対応するため意図的）。異なるキーワードのハッシュタグ（例: `#A 朝活` と `#B 朝活`）はキーワードが残るため別グループのまま

## References

- [Issue #30](https://github.com/amay077/pppost/issues/30) - Threads のハッシュタグ（#削除）で reply グループ化が分裂する
