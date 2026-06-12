# Threads Posting Specification

## Overview

Threads Graph API を用いたテキスト・画像投稿機能の仕様。本デルタは PPP-009（テキスト投稿）の `### Requirement: Threads へのテキスト投稿` から「画像を送信してはならない (SHALL NOT)」制約を解除（MODIFIED）し、画像投稿要件を新規追加（ADDED）する。

## MODIFIED Requirements

### Requirement: Threads へのテキスト投稿（Post text to Threads）

システムは、Threads が投稿対象に選択されているとき、入力テキストをバックエンド経由で Threads へ投稿しなければならない (SHALL)。バックエンドは、メディアコンテナ作成（`media_type=TEXT`）と公開（`creation_id` 指定）の 2 段階で投稿を行わなければならない (SHALL)。画像を添付して投稿する場合の振る舞いは `### Requirement: Threads への画像投稿` に従う。MVP ではリプライ先を Threads へ送信してはならない (SHALL NOT)。投稿に失敗した場合、システムは失敗を無言で握りつぶしてはならず (SHALL NOT)、エラー一覧に `Threads` を含めてユーザーへ通知しなければならない (SHALL)。

#### Scenario: テキストを Threads に投稿する（Post text successfully）

- **GIVEN** ユーザーが Threads に接続済みで、投稿対象チェックボックスが ON、本文が入力されている
- **AND** 画像を添付していない
- **WHEN** 投稿ボタンを押下する
- **THEN** バックエンドがコンテナ作成（`media_type=TEXT`）→ 公開の 2 段階で投稿を完了する
- **AND** Mastodon・Bluesky など他の選択中 SNS への投稿と並行して成功通知が表示される

#### Scenario: 投稿に失敗する（Post fails）

- **GIVEN** ユーザーが Threads を投稿対象に選択している
- **AND** コンテナ作成または公開のいずれかが失敗する状態である
- **WHEN** 投稿ボタンを押下する
- **THEN** エラー一覧に `Threads` が含まれ、ユーザーへ投稿失敗が通知される

## ADDED Requirements

### Requirement: Threads への画像投稿（Post images to Threads）

システムは、ユーザーが画像を添付して Threads 投稿を実行したとき、Supabase に一時保存された公開 URL を用いて Threads API に画像付き投稿を行わなければならない (SHALL)。

画像が 1 枚の場合は `media_type=IMAGE` で単画像コンテナを作成し、2 枚以上の場合は各画像を `media_type=IMAGE` の子コンテナとして作成したうえで `media_type=CAROUSEL` の親コンテナにまとめなければならない (SHALL)。Threads API のカルーセル上限に合わせ、添付画像は最大 10 枚まで対応しなければならない (SHALL)。

添付画像が 11 枚以上の場合、システムは Threads への投稿を試行してはならず (SHALL NOT)、Threads への投稿を失敗として扱い、エラー一覧に `Threads` を含めてユーザーへ通知しなければならない (SHALL)。

バックエンドは `images` 配列が空または未指定の場合、PPP-009 のテキスト投稿フロー（`### Requirement: Threads へのテキスト投稿`）で処理しなければならない (SHALL)。

#### Scenario: 単画像投稿（Single image post）

- **GIVEN** ユーザーが本文と画像 1 枚を入力し、Threads にチェックを入れている
- **WHEN** 投稿ボタンを押す
- **THEN** `media_type=IMAGE` のコンテナが作成され、公開後に Threads タイムラインに画像付き投稿が表示される

#### Scenario: 複数画像投稿（Multiple images post）

- **GIVEN** ユーザーが本文と画像 3 枚を入力し、Threads にチェックを入れている
- **WHEN** 投稿ボタンを押す
- **THEN** 3 枚の `media_type=IMAGE` 子コンテナと 1 つの `media_type=CAROUSEL` 親コンテナが作成され、公開後にカルーセル投稿が表示される

#### Scenario: テキストのみ投稿（Text only post）

- **GIVEN** ユーザーが本文のみ入力し（画像なし）、Threads にチェックを入れている
- **WHEN** 投稿ボタンを押す
- **THEN** PPP-009 のテキスト投稿フロー（`media_type=TEXT`）で処理され、テキストのみ投稿が完了する

#### Scenario: 上限を超える枚数の添付（Exceeds maximum image count）

- **GIVEN** ユーザーが本文と画像 11 枚を入力し、Threads にチェックを入れている
- **WHEN** 投稿ボタンを押す
- **THEN** Threads への投稿は試行されず、失敗として扱われる
- **AND** エラー一覧に `Threads` が含まれ、ユーザーへ投稿失敗が通知される

### Requirement: Threads 画像投稿失敗時のエラー通知（Image post failure notification）

システムは、画像付き Threads 投稿の多段フロー（子コンテナ作成・親コンテナ作成・公開）のいずれかが失敗した場合、失敗を無言で握りつぶしてはならず (SHALL NOT)、エラー一覧に `Threads` を含めてユーザーへ通知しなければならない (SHALL)。複数画像投稿時、子コンテナのいずれか 1 つでも作成に失敗した場合、システムはその投稿全体を失敗として扱わなければならない (SHALL)。

#### Scenario: 子コンテナ作成失敗（Child container creation fails）

- **GIVEN** ユーザーが本文と画像 3 枚を入力し、Threads にチェックを入れている
- **AND** 3 枚のうち 1 枚の子コンテナ作成（`media_type=IMAGE`）が失敗する状態である
- **WHEN** 投稿ボタンを押す
- **THEN** 親コンテナ作成・公開は行われず、Threads 投稿が失敗として扱われる
- **AND** エラー一覧に `Threads` が含まれ、ユーザーへ投稿失敗が通知される

#### Scenario: 公開失敗（Publish fails）

- **GIVEN** ユーザーが本文と画像 1 枚を入力し、Threads にチェックを入れている
- **AND** コンテナ作成は成功するが公開（`threads_publish`）が失敗する状態である
- **WHEN** 投稿ボタンを押す
- **THEN** Threads 投稿が失敗として扱われる
- **AND** エラー一覧に `Threads` が含まれ、ユーザーへ投稿失敗が通知される

## Open Questions

- Threads API の画像/カルーセルコンテナは作成直後に publish 可能とは限らず、`status` が `FINISHED` になるまでポーリングが推奨されている（IN_PROGRESS の状態でも作成 ID は返る）。MVP では作成直後に publish を試行し、失敗時は前述のエラー通知要件で処理する。安定性に問題が出た場合、publish 前のステータス確認（または短時間待機）を後続変更で導入するか検討する。
