# web-share Specification

## Purpose
Web Share API を用いて、入力テキストと選択画像を OS の共有シート経由で任意のアプリへ転送する機能。
## Requirements
### Requirement: Web Share API による共有（Share via Web Share API）

システムは、ユーザーが共有ボタンを押下したとき、Web Share API (`navigator.share`) を用いて OS の共有シートを起動しなければならない (SHALL)。共有はユーザー操作起点でのみ呼び出さなければならない (SHALL)。画像が選択されている場合、システムは選択中の全画像（`images: ImageData[]`）について各画像の表示中 URL（`img.croppedUrl ?? img.originalUrl`）を Blob → `File` に変換し、`files: File[]` 配列としてすべて共有対象に含めなければならない (SHALL)。

#### Scenario: テキストを共有する（Share text）

- **GIVEN** ユーザーが投稿テキストを入力している（画像なし）
- **WHEN** 共有ボタンを押下する
- **THEN** OS の共有シートが開き、入力テキストが共有対象として渡される

#### Scenario: テキストと複数画像を共有する（Share text and multiple images）

- **GIVEN** ユーザーがテキストと複数枚の画像を入力している
- **AND** ブラウザがファイル共有に対応している
- **WHEN** 共有ボタンを押下する
- **THEN** OS の共有シートが開き、テキストと選択中の全画像が `files: File[]` 配列として共有対象に渡される
- **AND** 各画像はクロップ済みであればクロップ後の画像（`img.croppedUrl`）、未クロップであれば元画像（`img.originalUrl`）が共有される

### Requirement: ファイル共有非対応時のフォールバック（Fallback when file sharing is unsupported）

システムは、`navigator.canShare({ files })` がファイル共有を非対応と判定した場合、テキストのみの共有にフォールバックしなければならない (SHALL)。

#### Scenario: ファイル共有非対応（File sharing unsupported）

- **GIVEN** ユーザーがテキストと画像を入力している
- **AND** ブラウザがファイル共有に対応していない
- **WHEN** 共有ボタンを押下する
- **THEN** テキストのみが共有対象として渡される

### Requirement: 共有内容が空のときの無効化（Disable when content is empty）

システムは、テキストが空かつ画像が 1 枚も選択されていない場合、共有ボタンを無効化しなければならない (SHALL)。無効化条件は既存の投稿ボタンと同一（`text.length <= 0 && images.length <= 0`）でなければならない (SHALL)。空内容で `navigator.share` を呼び出してはならない (SHALL NOT)。

#### Scenario: テキストも画像も無いときは無効（Disabled when text and images are empty）

- **GIVEN** 投稿テキストが空であり、画像も 1 枚も選択されていない
- **WHEN** 共有ボタンの状態を確認する
- **THEN** 共有ボタンは無効化されている

#### Scenario: テキストまたは画像があれば有効（Enabled when text or image exists）

- **GIVEN** 投稿テキストが入力されている、または画像が 1 枚以上選択されている
- **WHEN** 共有ボタンの状態を確認する
- **THEN** 共有ボタンは有効である

### Requirement: 共有のキャンセル・失敗時の扱い（Handling share cancellation and failure）

システムは、`navigator.share` の実行中に発生した結果を以下のとおり扱わなければならない (SHALL)。ユーザーが共有シートをキャンセルした場合（`AbortError`）はエラーを表示せず正常終了しなければならない (SHALL)。`AbortError` 以外の共有失敗時は、失敗した旨をユーザーに通知しなければならない (SHALL)。共有失敗を無言で握りつぶしてはならない (SHALL NOT)。

#### Scenario: ユーザーが共有をキャンセルする（User cancels sharing）

- **GIVEN** 共有ボタンを押下し、OS の共有シートが開いている
- **WHEN** ユーザーが共有シートを閉じてキャンセルする（`navigator.share` が `AbortError` で reject する）
- **THEN** エラーメッセージは表示されず、処理は正常終了する

#### Scenario: 共有がエラーで失敗する（Sharing fails with an error）

- **GIVEN** ユーザーが共有ボタンを押下する
- **WHEN** `navigator.share` が `AbortError` 以外の理由で reject する
- **THEN** 共有に失敗した旨がユーザーに通知される

### Requirement: Web Share API 非対応環境の扱い（Unsupported Web Share API）

システムは、`navigator.share` が利用できない環境では共有ボタンを非表示にしなければならない (SHALL)。

#### Scenario: Web Share API 非対応（Web Share API unavailable）

- **GIVEN** ブラウザが Web Share API に対応していない
- **WHEN** ユーザーが投稿画面を確認する
- **THEN** 共有ボタンは表示されない

## Related Changes

- [2026-06-03-PPP-008-add-web-share](../../changes/archive/2026-06-03-PPP-008-add-web-share/proposal.md)

