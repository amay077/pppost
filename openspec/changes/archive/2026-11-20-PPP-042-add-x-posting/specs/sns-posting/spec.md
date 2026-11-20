## MODIFIED Requirements

### Requirement: 投稿対象 SNS の範囲

システムは、フロントエンドからの投稿対象を Bluesky・Threads・Misskey・X としなければならない (SHALL)。Mastodon は投稿対象から除外し、投稿対象の選択肢・接続 UI・投稿処理をフロントエンドに表示・実行してはならない (SHALL NOT)。

X への投稿はテキスト投稿のみとし、画像・動画・リプライ・引用を伴う投稿では X を投稿対象として選択させてはならない (SHALL NOT)。X の接続・投稿の詳細な振る舞いは `x-posting` capability に従う。

各投稿対象の接続・投稿の詳細な振る舞いは、当該 SNS の capability（`threads-posting`、`misskey-posting`、`x-posting` 等）に従う。

twitter-text による文字数カウント表示は、X の重み付き 280 文字の目安として維持する。

#### Scenario: 投稿対象に X が表示される（X is selectable）

- **GIVEN** ユーザーがアプリの投稿画面を開いている
- **WHEN** 投稿対象 SNS の選択肢を確認する
- **THEN** 選択肢には Bluesky・Threads・Misskey・X が表示される
- **AND** Mastodon の投稿対象チェックボックスと接続 UI は表示されない

#### Scenario: 廃止済み SNS が表示されない（Removed SNS are not selectable）

- **GIVEN** ユーザーがアプリの投稿画面を開いている
- **WHEN** 投稿対象 SNS の選択肢を確認する
- **THEN** Mastodon の投稿対象チェックボックスと接続 UI は表示されない

#### Scenario: X はテキスト投稿のみ（X supports text posts only）

- **GIVEN** ユーザーが X を投稿対象に選択している
- **WHEN** 画像・動画・リプライ元・引用元のいずれかを指定する
- **THEN** X の選択が解除され、X への投稿は行われない
- **AND** 他の投稿対象 SNS への投稿は妨げられない

#### Scenario: 既存 SNS への投稿は従来通り動作する（Existing SNS posting still works）

- **GIVEN** ユーザーが Bluesky・Threads・Misskey のいずれかに接続済みである
- **WHEN** テキストと画像を入力して投稿を実行する
- **THEN** それらの SNS への投稿が従来通り正常に完了する

#### Scenario: 文字数カウント表示は維持される（Character count remains）

- **GIVEN** ユーザーが投稿テキストを入力している
- **WHEN** テキスト入力エリアを確認する
- **THEN** twitter-text による重み付き文字数が 280 を上限として表示される
