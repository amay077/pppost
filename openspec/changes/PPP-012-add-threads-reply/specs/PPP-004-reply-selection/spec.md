# PPP-004-reply-selection Specification

## Overview

リプライ元選択のグループ化対象 SNS に Threads を追加する。グループ化ロジック自体（テキスト正規化・タイムスタンプ表示）は変更しない。

## MODIFIED Requirements

### Requirement: 投稿の内容別グループ化

システムは、リプライ元選択ドロップダウンで表示する投稿を、同一内容のものをグループ化して表示しなければならない (SHALL group posts with identical content)。グループ化の対象は現在対応しているすべての投稿先 SNS（Mastodon、Bluesky、Threads）とする。

#### Scenario: 同じ内容を複数 SNS に投稿

- **WHEN** 同じテキスト内容が複数の SNS（Mastodon、Bluesky、Threads）に投稿されている
- **THEN** それらの投稿は1つのグループとして表示される
- **AND** グループ内の各 SNS の投稿情報が保持される

#### Scenario: 異なる内容は別グループになる

- **WHEN** 異なるテキスト内容の投稿がある
- **THEN** それらは別々のグループとして表示される
