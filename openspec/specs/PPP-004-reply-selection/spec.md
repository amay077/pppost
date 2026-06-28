# PPP-004-reply-selection Specification

## Purpose
リプライ元選択ドロップダウンにおいて、同一内容の投稿を複数の SNS（X、Mastodon、Bluesky）にまたがって適切にグループ化し、ユーザーが同じ投稿を重複して選択する必要をなくす。テキストの正規化により、URL や HTML タグ、空白の違いを吸収し、本文の内容が同一であれば1つのグループとして表示する。これにより、リプライ投稿時の UX を向上させる。
## Requirements
### Requirement: 投稿の内容別グループ化

システムは、リプライ元選択ドロップダウンで表示する投稿を、同一内容のものをグループ化して表示しなければならない (SHALL group posts with identical content)。グループ化の対象は現在対応しているすべての投稿先 SNS（Mastodon、Bluesky、Threads）とする。

システムは、グループ化した投稿を投稿日時の降順（新しいものが上）で表示しなければならない (SHALL)。各グループの並び順の基準にはグループ内の最新投稿日時を用いる。SNS ごとに取得した投稿を単純に連結した順序で表示してはならない (SHALL NOT)。

#### Scenario: 同じ内容を複数 SNS に投稿

- **WHEN** 同じテキスト内容が複数の SNS（Mastodon、Bluesky、Threads）に投稿されている
- **THEN** それらの投稿は1つのグループとして表示される
- **AND** グループ内の各 SNS の投稿情報が保持される

#### Scenario: 異なる内容は別グループになる

- **WHEN** 異なるテキスト内容の投稿がある
- **THEN** それらは別々のグループとして表示される

#### Scenario: 投稿日時の降順で表示される

- **WHEN** 複数の SNS（Mastodon、Bluesky、Threads）から取得した投稿をドロップダウンに表示する
- **THEN** SNS の取得順にかかわらず、すべてのグループが投稿日時の降順で並ぶ
- **AND** 月や年をまたぐ場合も日時として正しく比較される

### Requirement: グループ化のためのテキスト正規化

システムは、投稿のグループ化時にテキストを正規化して比較しなければならない (SHALL normalize text for grouping comparison)。

#### Scenario: 空白の違いは無視される

- **WHEN** 投稿テキストの空白や改行が微妙に異なる
- **THEN** 連続する空白文字は1つに統一され、前後の空白は削除される
- **AND** それらは同一のテキストとして扱われる

#### Scenario: URL は除去される

- **WHEN** 投稿テキストに URL が含まれている
- **THEN** グループ化のための正規化時に URL (`http://` または `https://` で始まる文字列) は除去される
- **AND** URL を除いた本文のみで比較される

#### Scenario: HTML タグとエンティティは除去される

- **WHEN** 投稿テキストに HTML タグまたは HTML エンティティが含まれている
- **THEN** グループ化のための正規化時にそれらは除去または変換される

#### Scenario: 十分な長さのテキスト比較

- **WHEN** 投稿のグループ化キーを生成する
- **THEN** テキストの最初の10文字だけではなく、正規化後のテキストの少なくとも50%が使用される

### Requirement: 正確なタイムスタンプ表示

システムは、投稿日時を正確なフォーマットで表示しなければならない (SHALL display timestamps with accurate format)。

#### Scenario: 正しいフォーマットトークンを使用

- **WHEN** 投稿日時をフォーマットする
- **THEN** 分は `mm`（小文字）を使用する
- **AND** 月は `MM`（大文字）を使用する
- **AND** 時は `H` または `HH` を使用する

#### Scenario: 表示フォーマットは M/DD H:mm

- **WHEN** リプライ選択ドロップダウンで投稿日時を表示する
- **THEN** フォーマットは `M/DD H:mm` である

## Related Changes

- [2025-10-19-PPP-003-fix-reply-grouping](../../changes/archive/2025-10-19-PPP-003-fix-reply-grouping/proposal.md)
- [2026-06-28-PPP-012-add-threads-reply](../../changes/archive/2026-06-28-PPP-012-add-threads-reply/proposal.md)

