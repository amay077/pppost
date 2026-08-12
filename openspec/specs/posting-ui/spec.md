# posting-ui Specification

## Purpose
TBD - created by archiving change PPP-040_remove-page-loading-gate. Update Purpose after archive.
## Requirements
### Requirement: Page Loading Gate Removal（全 UI ブロックの撤去）

システムは、ページ読み込み中に全 UI を `loading..` 表示で隠してはならず（MUST NOT）、フォーム・ボタン群を即時描画しなければならない（SHALL）。

#### Scenario: 通常アクセス時の即時描画

- **GIVEN** ユーザーが共有 URL パラメータなしでページを開いたとき
- **WHEN** ページの描画が完了したとき
- **THEN** `loading..` 表示を経由せずに投稿フォームが即座に表示される

#### Scenario: Threads 接続済みでのページ描画

- **GIVEN** Threads が接続済みで、バックグラウンドで `threads_refresh` が実行されるとき
- **WHEN** ページが読み込まれたとき
- **THEN** セッションリフレッシュの完了を待たずにフォームが表示される

### Requirement: Post Button Disable During Initialization（初期化中の投稿ボタン無効化）

システムは、テキスト処理（Swarm / YouTube / 汎用タイトル取得）またはセッション処理（Threads OAuth コールバック交換 / `threads_refresh`）のいずれかが実行中の場合、投稿ボタンを無効にしなければならない（SHALL）。

#### Scenario: 共有 URL 起動時の投稿抑止

- **GIVEN** `?url=` パラメータ付きでページが開かれ、タイトル取得が実行中であるとき
- **WHEN** タイトル取得が完了する前に投稿ボタンを押そうとしたとき
- **THEN** 投稿ボタンは無効であり、タイトル補完後のテキストが適用された後に有効化される

#### Scenario: セッションリフレッシュ完了後の有効化

- **GIVEN** Threads 接続済みで `threads_refresh` が実行中であるとき
- **WHEN** リフレッシュが完了したとき
- **THEN** 投稿ボタンが有効化される（他の無効条件が満たされていない場合）

### Requirement: Textarea Disable During Text Processing（テキスト処理中の textarea 無効化）

システムは、テキスト処理（Swarm スクレイピング / YouTube タイトル取得 / 汎用タイトル取得）が実行中の場合、textarea を無効にしなければならない（SHALL）。これは、取得結果によるテキスト上書きとユーザー入力の競合を防ぐためである。

#### Scenario: タイトル取得中の入力抑止

- **GIVEN** 共有 URL のタイトル取得が実行中であるとき
- **WHEN** ユーザーが textarea へ入力を試みたとき
- **THEN** textarea は無効であり、取得完了後に有効化される

### Requirement: Clear Button Disable During Text Processing（テキスト処理中の Clear ボタン無効化）

システムは、テキスト処理が実行中の場合、Clear ボタンを無効にしなければならない（SHALL）。これは、クリア後に取得結果のテキストが復活することを防ぐためである。

#### Scenario: タイトル取得中のクリア抑止

- **GIVEN** 共有 URL のタイトル取得が実行中であるとき
- **WHEN** ユーザーが Clear ボタンを押そうとしたとき
- **THEN** Clear ボタンは無効であり、取得完了後に有効化される

### Requirement: Text Processing Indicator（テキスト処理中インジケータ）

システムは、テキスト処理が実行中の間、Message ラベル横にスピナーを表示しなければならない（SHALL）。

#### Scenario: スピナー表示

- **GIVEN** 共有 URL のタイトル取得が実行中であるとき
- **WHEN** ページが描画されているとき
- **THEN** Message ラベル横にスピナーが表示され、取得完了後に非表示になる

## Related Changes

- [2026-08-12-PPP-040_remove-page-loading-gate](../../changes/archive/2026-08-12-PPP-040_remove-page-loading-gate/proposal.md)

