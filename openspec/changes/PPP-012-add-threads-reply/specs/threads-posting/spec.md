# Threads Posting Specification

## Overview

Threads のリプライ対応。本デルタは、テキスト投稿要件から「リプライ先を送信してはならない (SHALL NOT)」制約を解除（MODIFIED）し、自投稿取得とリプライ投稿の要件を新規追加（ADDED）する。

## MODIFIED Requirements

### Requirement: Threads へのテキスト投稿（Post text to Threads）

システムは、Threads が投稿対象に選択されているとき、入力テキストをバックエンド経由で Threads へ投稿しなければならない (SHALL)。バックエンドは、メディアコンテナ作成（`media_type=TEXT`）と公開（`creation_id` 指定）の 2 段階で投稿を行わなければならない (SHALL)。画像を添付して投稿する場合の振る舞いは `### Requirement: Threads への画像投稿` に、リプライ元が選択されている場合の振る舞いは `### Requirement: Threads へのリプライ投稿` に従う。投稿に失敗した場合、システムは失敗を無言で握りつぶしてはならず (SHALL NOT)、エラー一覧に `Threads` を含めてユーザーへ通知しなければならない (SHALL)。

#### Scenario: テキストを Threads に投稿する（Post text successfully）

- **GIVEN** ユーザーが Threads に接続済みで、投稿対象チェックボックスが ON、本文が入力されている
- **AND** 画像を添付しておらず、リプライ元も選択していない
- **WHEN** 投稿ボタンを押下する
- **THEN** バックエンドがコンテナ作成（`media_type=TEXT`）→ 公開の 2 段階で投稿を完了する
- **AND** Mastodon・Bluesky など他の選択中 SNS への投稿と並行して成功通知が表示される

#### Scenario: 投稿に失敗する（Post fails）

- **GIVEN** ユーザーが Threads を投稿対象に選択している
- **AND** コンテナ作成または公開のいずれかが失敗する状態である
- **WHEN** 投稿ボタンを押下する
- **THEN** エラー一覧に `Threads` が含まれ、ユーザーへ投稿失敗が通知される

## ADDED Requirements

### Requirement: Threads の自投稿取得（Fetch own Threads posts）

システムは、ユーザーがリプライ元選択 UI を展開したとき、Threads に接続済みであれば、バックエンド経由で Threads API（`GET /me/threads`、`fields=id,text,permalink,timestamp`）を呼び出して自投稿一覧を取得し、Mastodon・Bluesky の自投稿と同様にリプライ元候補として表示しなければならない (SHALL)。

取得した各投稿について、システムは Threads API の投稿 `id` を保持しなければならない (SHALL)。permalink の末尾はショートコードであり API の投稿 ID ではないため、permalink から ID を導出してはならない (SHALL NOT)。

画像のみの投稿は Threads API が `text` フィールドを返さないため、システムは本文を空文字として扱わなければならず (SHALL)、`text` が欠落した投稿を候補から除外したり、処理を中断したりしてはならない (SHALL NOT)。

Threads の自投稿取得に失敗した場合でも、システムは Mastodon・Bluesky の自投稿候補の表示を妨げてはならない (SHALL NOT)。また、取得の成否にかかわらず、リプライ元選択 UI がローディング表示のまま固定されてはならない (SHALL NOT)。

#### Scenario: 接続済みで自投稿が候補に表示される（Own posts appear as reply candidates）

- **GIVEN** ユーザーが Threads に接続済みで、Threads に投稿が存在する
- **WHEN** リプライ元選択 UI を展開する
- **THEN** Threads の自投稿がリプライ元候補のドロップダウンに表示される

#### Scenario: 未接続時は取得しない（No fetch when not connected）

- **GIVEN** ユーザーが Threads に接続していない
- **WHEN** リプライ元選択 UI を展開する
- **THEN** Threads の自投稿取得 API は呼び出されない
- **AND** Mastodon・Bluesky の自投稿候補は従来通り表示される

#### Scenario: Threads の取得失敗は他 SNS に影響しない（Fetch failure does not block other SNS）

- **GIVEN** ユーザーが Threads に接続済みだが、Threads の自投稿取得が失敗する状態である
- **WHEN** リプライ元選択 UI を展開する
- **THEN** Mastodon・Bluesky の自投稿候補は従来通り表示される
- **AND** リプライ元選択 UI のローディング表示は解除される

#### Scenario: 画像のみの自投稿を候補に含める（Image-only post appears as candidate）

- **GIVEN** ユーザーが Threads に接続済みで、本文を持たない画像のみの投稿が存在する
- **WHEN** リプライ元選択 UI を展開する
- **THEN** 画像のみの投稿も本文を空文字として候補に表示され、エラーで処理が中断しない

### Requirement: Threads へのリプライ投稿（Post reply to Threads）

システムは、リプライ元として Threads の自投稿が選択されているとき、コンテナ作成（`POST /me/threads`）に `reply_to_id`（自投稿取得 API で得た投稿 `id`）を指定して、リプライとして投稿しなければならない (SHALL)。画像付きの場合も同様に、トップレベルのコンテナ（カルーセルの場合は親コンテナ）に `reply_to_id` を付与しなければならない (SHALL)。

リプライ作成には Threads API の `threads_manage_replies` スコープが必要である。通常投稿に必要な `threads_content_publish` だけでは `reply_to_id` 付きコンテナ作成が権限エラー（`code: 10` "Application does not have permission"）となるため、システムは認可時に `threads_basic,threads_content_publish,threads_manage_replies` を要求しなければならない (SHALL)。

リプライ元が選択されていない場合、または選択されたリプライ元グループに Threads の投稿が含まれない場合、システムは `reply_to_id` を付与せず通常投稿として処理しなければならない (SHALL)。

リプライ投稿に失敗した場合、システムはエラー一覧に `Threads` を含めてユーザーへ通知しなければならない (SHALL)。

#### Scenario: 自投稿を選択してリプライする（Reply to own post）

- **GIVEN** ユーザーが Threads に接続済みで、リプライ元として Threads の自投稿を選択し、本文を入力している
- **WHEN** 投稿ボタンを押下する
- **THEN** コンテナ作成に `reply_to_id` が付与され、選択した自投稿へのリプライとして公開される

#### Scenario: 画像付きでリプライする（Reply with images）

- **GIVEN** ユーザーがリプライ元として Threads の自投稿を選択し、本文と画像を入力している
- **WHEN** 投稿ボタンを押下する
- **THEN** 画像投稿要件に従ったコンテナ（単画像またはカルーセル親）に `reply_to_id` が付与され、リプライとして公開される

#### Scenario: リプライ元未選択時は通常投稿（Normal post without reply selection）

- **GIVEN** ユーザーが Threads を投稿対象に選択し、リプライ元を選択していない
- **WHEN** 投稿ボタンを押下する
- **THEN** `reply_to_id` なしの通常投稿として公開される

#### Scenario: リプライ失敗時の通知（Reply failure notification）

- **GIVEN** ユーザーがリプライ元として Threads の自投稿を選択している
- **AND** リプライ投稿が失敗する状態である（権限不足・元投稿の削除など）
- **WHEN** 投稿ボタンを押下する
- **THEN** エラー一覧に `Threads` が含まれ、ユーザーへ投稿失敗が通知される
