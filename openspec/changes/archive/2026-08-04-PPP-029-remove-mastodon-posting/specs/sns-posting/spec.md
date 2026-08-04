## MODIFIED Requirements

### Requirement: 投稿対象 SNS の範囲

システムは、フロントエンドからの投稿対象を Bluesky・Threads・Misskey に限定しなければならない (SHALL)。Twitter (X) および Mastodon は投稿対象から除外し、投稿対象の選択肢・接続 UI・投稿処理をフロントエンドに表示・実行してはならない (SHALL NOT)。

各投稿対象の接続・投稿の詳細な振る舞いは、当該 SNS の capability（`threads-posting`、`misskey-posting` 等）に従う。

twitter-text による文字数カウント表示は、本要件の対象外として温存してよい。

#### Scenario: 廃止済み SNS が表示されない（Removed SNS are not selectable）

- **GIVEN** ユーザーがアプリの投稿画面を開いている
- **WHEN** 投稿対象 SNS の選択肢を確認する
- **THEN** 選択肢には Bluesky・Threads・Misskey のみが表示される
- **AND** Twitter (X) および Mastodon の投稿対象チェックボックスと接続 UI は表示されない

#### Scenario: 既存 SNS への投稿は従来通り動作する（Existing SNS posting still works）

- **GIVEN** ユーザーが Bluesky・Threads・Misskey のいずれかに接続済みである
- **WHEN** テキストと画像を入力して投稿を実行する
- **THEN** それらの SNS への投稿が従来通り正常に完了する

#### Scenario: 文字数カウント表示は維持される（Character count remains）

- **GIVEN** ユーザーが投稿テキストを入力している
- **WHEN** テキスト入力エリアを確認する
- **THEN** twitter-text による文字数カウント表示が投稿長の目安として表示される
