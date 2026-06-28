# PPP-004-reply-selection Specification

## Overview

リプライ元選択のグループ化対象 SNS に Threads を追加し、グループ化後の表示順を投稿日時の降順に統一する。テキスト正規化・タイムスタンプ表示のロジックは変更しない。

## MODIFIED Requirements

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
