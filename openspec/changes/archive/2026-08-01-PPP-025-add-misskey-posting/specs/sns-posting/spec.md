## RENAMED Requirements

- FROM: `### Requirement: 投稿対象 SNS の範囲（Mastodon と Bluesky のみ）`
- TO: `### Requirement: 投稿対象 SNS の範囲`

## MODIFIED Requirements

### Requirement: 投稿対象 SNS の範囲

システムは、フロントエンドからの投稿対象を Mastodon・Bluesky・Threads・Misskey に限定しなければならない (SHALL)。Twitter (X) は投稿対象から除外し、投稿対象の選択肢・接続 UI・投稿処理をフロントエンドに表示・実行してはならない (SHALL NOT)。

各投稿対象の接続・投稿の詳細な振る舞いは、当該 SNS の capability（`threads-posting`、`misskey-posting` 等）に従う。

バックエンドの Twitter 用機能や twitter-text による文字数カウント表示は、本要件の対象外として温存してよい。

#### Scenario: 投稿対象選択に Twitter が表示されない（Twitter is not selectable）

- **GIVEN** ユーザーがアプリの投稿画面を開いている
- **WHEN** 投稿対象 SNS の選択肢を確認する
- **THEN** 選択肢には Mastodon・Bluesky・Threads・Misskey のみが表示される
- **AND** Twitter (X) の投稿対象チェックボックスと接続 UI は表示されない

#### Scenario: 既存 SNS への投稿は従来通り動作する（Existing SNS posting still works）

- **GIVEN** ユーザーが Mastodon・Bluesky・Threads のいずれかに接続済みである
- **WHEN** テキストと画像を入力して投稿を実行する
- **THEN** それらの SNS への投稿が従来通り正常に完了する

#### Scenario: 文字数カウント表示は維持される（Character count remains）

- **GIVEN** ユーザーが投稿テキストを入力している
- **WHEN** テキスト入力エリアを確認する
- **THEN** twitter-text による文字数カウント表示が投稿長の目安として表示される
