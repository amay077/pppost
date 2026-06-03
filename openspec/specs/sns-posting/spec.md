# sns-posting Specification

## Purpose
本アプリがフロントエンドから投稿可能な SNS（投稿対象）の範囲を定める。投稿対象は Mastodon と Bluesky とし、Twitter (X) はフロントエンドから廃除する。バックエンドの Twitter 用機能や twitter-text による文字数カウント表示は温存する。
## Requirements
### Requirement: 投稿対象 SNS の範囲（Mastodon と Bluesky のみ）

システムは、フロントエンドからの投稿対象を Mastodon と Bluesky に限定しなければならない (SHALL)。Twitter (X) は投稿対象から除外し、投稿対象の選択肢・接続 UI・投稿処理をフロントエンドに表示・実行してはならない (SHALL NOT)。

バックエンドの Twitter 用機能や twitter-text による文字数カウント表示は、本要件の対象外として温存してよい。

#### Scenario: 投稿対象選択に Twitter が表示されない（Twitter is not selectable）

- **GIVEN** ユーザーがアプリの投稿画面を開いている
- **WHEN** 投稿対象 SNS の選択肢を確認する
- **THEN** 選択肢には Mastodon と Bluesky のみが表示される
- **AND** Twitter (X) の投稿対象チェックボックスと接続 UI は表示されない

#### Scenario: Mastodon・Bluesky への投稿は従来通り動作する（Other SNS posting still works）

- **GIVEN** ユーザーが Mastodon または Bluesky に接続済みである
- **WHEN** テキストと画像を入力して投稿を実行する
- **THEN** Mastodon・Bluesky への投稿が従来通り正常に完了する

#### Scenario: 文字数カウント表示は維持される（Character count remains）

- **GIVEN** ユーザーが投稿テキストを入力している
- **WHEN** テキスト入力エリアを確認する
- **THEN** twitter-text による文字数カウント表示が投稿長の目安として表示される

## Related Changes

- [2026-06-03-PPP-006-remove-twitter-posting](../../changes/archive/2026-06-03-PPP-006-remove-twitter-posting/proposal.md)

