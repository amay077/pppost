# posting-ui Delta

## ADDED Requirements

### Requirement: 投稿失敗原因のインライン表示（Inline display of post failure reasons）

システムは、投稿失敗時の原因を `alert` ダイアログではなく、投稿フォーム近くの画面内エラー表示領域に表示しなければならない (SHALL)。エラー表示は SNS 名と原因のペアのリストとして表示しなければならず (SHALL)、原因は分類（タイムアウト・ネットワークエラー・認証エラー・サーバーエラー・その他）を含むものとする (SHALL)。複数の SNS で失敗した場合、システムは失敗した全ての SNS の原因を一覧表示しなければならない (SHALL)。エラー表示は次回の投稿開始時にクリアしなければならない (SHALL)。投稿成功時の `alert("投稿しました。")` は従来通り表示してよい (MAY)。

#### Scenario: 単一 SNS の失敗原因がインライン表示される（Show failure reason of a single SNS）

- **GIVEN** ユーザーが Bluesky・Threads・Misskey のうち Bluesky のみを選択して投稿を実行した
- **AND** Bluesky への投稿がタイムアウトで失敗する状態である
- **WHEN** 投稿処理が完了する
- **THEN** `alert` は表示されず、画面内のエラー表示領域に `Bluesky: タイムアウトしました` のような SNS 名と原因が表示される

#### Scenario: 複数 SNS の失敗原因が一覧表示される（Show failure reasons of multiple SNS）

- **GIVEN** ユーザーが Bluesky・Threads・Misskey の全てを選択して投稿を実行した
- **AND** Bluesky がタイムアウト、Threads が認証エラーで失敗する状態である
- **WHEN** 投稿処理が完了する
- **THEN** エラー表示領域に Bluesky と Threads の両方の原因がリストとして表示される
- **AND** 成功した Misskey の投稿はエラー一覧に含まれない

#### Scenario: 次回投稿開始時にエラー表示がクリアされる（Clear errors on next post）

- **GIVEN** 投稿失敗のエラーがエラー表示領域に表示されている
- **WHEN** ユーザーが再度投稿を実行する
- **THEN** エラー表示領域がクリアされてから新しい投稿処理が開始される
