# Reply Selection Specification

## ADDED Requirements

### Requirement: Post Grouping by Content（投稿の内容別グループ化）

システムは、リプライ元選択ドロップダウンで表示する投稿を、同一内容のものをグループ化して表示しなければならない (SHALL group posts with identical content)。

#### Scenario: Same content posted to multiple SNS（同じ内容を複数 SNS に投稿）

- **WHEN** 同じテキスト内容が複数の SNS（X、Mastodon、Bluesky）に投稿されている
- **THEN** それらの投稿は1つのグループとして表示される
- **AND** グループ内の各 SNS の投稿情報が保持される

#### Scenario: Different content results in different groups（異なる内容は別グループになる）

- **WHEN** 異なるテキスト内容の投稿がある
- **THEN** それらは別々のグループとして表示される

### Requirement: Text Normalization for Grouping（グループ化のためのテキスト正規化）

システムは、投稿のグループ化時にテキストを正規化して比較しなければならない (SHALL normalize text for grouping comparison)。

#### Scenario: Whitespace differences are ignored（空白の違いは無視される）

- **WHEN** 投稿テキストの空白や改行が微妙に異なる
- **THEN** 連続する空白文字は1つに統一され、前後の空白は削除される
- **AND** それらは同一のテキストとして扱われる

#### Scenario: URLs are removed（URL は除去される）

- **WHEN** 投稿テキストに URL が含まれている
- **THEN** グループ化のための正規化時に URL (`http://` または `https://` で始まる文字列) は除去される
- **AND** URL を除いた本文のみで比較される

#### Scenario: HTML tags and entities are removed（HTML タグとエンティティは除去される）

- **WHEN** 投稿テキストに HTML タグまたは HTML エンティティが含まれている
- **THEN** グループ化のための正規化時にそれらは除去または変換される

#### Scenario: Sufficient text comparison（十分な長さのテキスト比較）

- **WHEN** 投稿のグループ化キーを生成する
- **THEN** テキストの最初の10文字だけではなく、正規化後のテキストの少なくとも50%が使用される

### Requirement: Accurate Timestamp Display（正確なタイムスタンプ表示）

システムは、投稿日時を正確なフォーマットで表示しなければならない (SHALL display timestamps with accurate format)。

#### Scenario: Time format uses correct tokens（正しいフォーマットトークンを使用）

- **WHEN** 投稿日時をフォーマットする
- **THEN** 分は `mm`（小文字）を使用する
- **AND** 月は `MM`（大文字）を使用する
- **AND** 時は `H` または `HH` を使用する

#### Scenario: Display format is M/DD H:mm（表示フォーマットは M/DD H:mm）

- **WHEN** リプライ選択ドロップダウンで投稿日時を表示する
- **THEN** フォーマットは `M/DD H:mm` である
