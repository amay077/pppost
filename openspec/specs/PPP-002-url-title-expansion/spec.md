# PPP-002-url-title-expansion Specification

## Purpose
TBD - created by archiving change PPP-002-share-url-title. Update Purpose after archive.
## Requirements
### Requirement: URL のみ判定

システムは、起動時クエリパラメータが URL のみであるかを判定しなければならない (SHALL determine if query parameter contains only URL)。

#### Scenario: text パラメータに URL のみが指定される

- **WHEN** クエリパラメータ `text` に URL 文字列のみが含まれている
- **THEN** システムはこれを「URL のみ」と判定する
- **AND** タイトル取得処理を開始する

#### Scenario: url パラメータのみが指定される

- **WHEN** クエリパラメータ `text` が空または未指定で、`url` のみが指定されている
- **THEN** システムはこれを「URL のみ」と判定する
- **AND** タイトル取得処理を開始する

#### Scenario: URL 以外のテキストが含まれる

- **WHEN** クエリパラメータにコメントやタイトルなど、URL 以外のテキストが含まれている
- **THEN** システムは「URL のみ」と判定しない
- **AND** タイトル取得処理を実行しない
- **AND** 既存の本文をそのまま使用する

### Requirement: ページタイトル取得

システムは、対象 URL のページタイトルを自動取得しなければならない (SHALL automatically fetch page title from target URL)。

#### Scenario: OGP タイトルが存在する

- **WHEN** 対象ページに OGP メタタグ `og:title` が存在する
- **THEN** システムは OGP タイトルを優先的に使用する

#### Scenario: OGP が存在せず title タグのみ

- **WHEN** 対象ページに OGP メタタグが存在せず、`<title>` タグのみが存在する
- **THEN** システムは `<title>` タグの内容をタイトルとして使用する

#### Scenario: タイトル取得失敗

- **WHEN** HTTP リクエストが失敗またはタイムアウトした
- **THEN** システムはエラーをログに記録する
- **AND** 本文を URL のまま維持する（変換しない）

### Requirement: 本文フォーマット変換

システムは、取得したタイトルを使用して本文を整形しなければならない (SHALL format post text using fetched title)。

#### Scenario: タイトル取得成功時の本文変換

- **WHEN** ページタイトルの取得に成功した
- **THEN** システムは本文を `{タイトル} - {URL}` 形式に変換する

#### Scenario: Swarm URL の優先処理

- **WHEN** URL が Swarm チェックイン URL（`https://swarmapp.com/.../checkin/...`）である
- **THEN** システムは既存の Swarm スクレイピング処理を優先する
- **AND** タイトル取得処理をスキップする
- **AND** Swarm スクレイピング結果を本文に使用する

### Requirement: ローディング状態管理

システムは、タイトル取得中のローディング状態を管理しなければならない (SHALL manage loading state during title fetch)。

#### Scenario: タイトル取得中はローディング状態

- **WHEN** タイトル取得処理を開始する
- **THEN** システムは `loading` フラグを `true` に設定する
- **AND** 処理完了後に `loading` フラグを `false` に戻す

