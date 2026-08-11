# threads-posting Specification

## Overview

Threads の自投稿取得（リプライ元候補の取得）に関する仕様。Threads API の仕様によりトップレベル投稿と返信は別エンドポイント（`GET /me/threads` / `GET /me/replies`）で取得されるため、両者をマージしてリプライ元候補とする。

## MODIFIED Requirements

### Requirement: Threads アカウント接続（Connect Threads account via OAuth）

システムは、ユーザーが Threads 接続を要求したとき、`threads_basic,threads_content_publish,threads_manage_replies,threads_read_replies` を指定した Meta OAuth の認可ページへ、登録済みの `redirect_uri` を用いてリダイレクトしなければならない (SHALL)。認可後にアプリへ戻った際、システムは受け取った認可コードをバックエンド経由で長命アクセストークン（60 日）へ交換し、`credential-custody` capability に従ってサーバー側の保管庫（Cloudflare D1）へ暗号化保存しなければならない (SHALL)。システムは長命トークンをクライアントへ返し `localStorage` に保存してはならない (SHALL NOT)。クライアントへ返してよいのはセッション ID と表示用メタ（`user_id` 等）に限る。システムは `client_secret` をフロントエンドで扱ってはならない (SHALL NOT)。Threads は OOB redirect を許可しないため、システムは認可コードの手動コピー＆ペースト方式を用いてはならない (SHALL NOT)。

`threads_read_replies` は Threads の返信一覧取得（`GET /me/replies`）に必要な権限である。自投稿取得で返信を候補に含めるため、システムはこの権限を認可スコープに含めなければならない (SHALL)。

#### Scenario: Threads に接続する（Connect to Threads）

- **GIVEN** ユーザーが Threads に未接続である
- **WHEN** 接続ボタンを押下し、Meta の認可ページで許可する
- **THEN** `redirect_uri` でアプリへ戻った後、認可コードがバックエンド経由で長命トークンへ交換される
- **AND** 長命トークンは D1 に暗号化保存され、クライアントにはセッション ID と表示用メタのみが返る
- **AND** Threads が「接続済み」として表示され、投稿対象チェックボックスが有効になる

#### Scenario: Threads を切断する（Disconnect Threads）

- **GIVEN** ユーザーが Threads に接続済みである
- **WHEN** 切断ボタンを押下する
- **THEN** サーバー保管庫から当該セッションの Threads トークンが削除される
- **AND** Threads の投稿対象チェックボックスが無効化される

#### Scenario: 未接続時は投稿対象に選択できない（Cannot select when not connected）

- **GIVEN** ユーザーが Threads に接続していない
- **WHEN** 投稿対象 SNS の選択肢を確認する
- **THEN** Threads のチェックボックスは無効化されている

#### Scenario: 返信の取得に必要な権限を要求する（Request permission required for reading replies）

- **GIVEN** ユーザーが Threads に未接続である
- **WHEN** 接続ボタンを押下し、Meta の認可ページが表示される
- **THEN** 認可 URL の `scope` に `threads_read_replies` が含まれる
- **AND** 認可後に発行されるトークンで `GET /me/replies` による返信一覧の取得が可能になる

### Requirement: Threads の自投稿取得（Fetch own Threads posts）

システムは、ユーザーがリプライ元選択 UI を展開したとき、Threads に接続済みであれば、バックエンド経由で Threads API（`GET /me/threads` および `GET /me/replies`、いずれも `fields=id,text,permalink,timestamp`）を呼び出して自投稿一覧を取得し、Bluesky・Misskey の自投稿と同様にリプライ元候補として表示しなければならない (SHALL)。Threads API の仕様ではトップレベル投稿は `GET /me/threads`、返信（リプライ）は `GET /me/replies` で取得されるため、システムは両方のエンドポイントの結果をマージして候補にしなければならず (SHALL)、返信投稿を候補から除外してはならない (SHALL NOT)。これは Bluesky（`getAuthorFeed` の既定 `posts_with_replies`）や Misskey（`withReplies: true`）が自分のリプライを候補に含めることと母集合を揃えるためである。`GET /me/replies` の呼び出しには `threads_read_replies` スコープが必要であるため、システムは接続時にこのスコープを要求し、取得失敗時は不足権限の可能性をログに残さなければならない (SHALL)。

取得した各投稿について、システムは Threads API の投稿 `id` を保持しなければならない (SHALL)。permalink の末尾はショートコードであり API の投稿 ID ではないため、permalink から ID を導出してはならない (SHALL NOT)。

画像のみの投稿は Threads API が `text` フィールドを返さないため、システムは本文を空文字として扱わなければならず (SHALL)、`text` が欠落した投稿を候補から除外したり、処理を中断したりしてはならない (SHALL NOT)。

トップレベル投稿と返信の取得結果は同一の投稿集合を指すことがないため重複しないが、システムは万一の重複に備えて投稿 `id` による重複除去を行わなければならない (SHALL)。

Threads の自投稿取得に失敗した場合でも、システムは Bluesky・Misskey の自投稿候補の表示を妨げてはならない (SHALL NOT)。また、取得の成否にかかわらず、リプライ元選択 UI がローディング表示のまま固定されてはならない (SHALL NOT)。トップレベル投稿と返信のうち一方の取得に失敗した場合、システムは成功した側の結果を候補として表示しなければならず (SHALL)、両方の取得が失敗した場合のみ Threads の自投稿を取得できなかったものとして扱わなければならない (SHALL)。

#### Scenario: 接続済みで自投稿が候補に表示される（Own posts appear as reply candidates）

- **GIVEN** ユーザーが Threads に接続済みで、Threads に投稿が存在する
- **WHEN** リプライ元選択 UI を展開する
- **THEN** Threads の自投稿がリプライ元候補のドロップダウンに表示される

#### Scenario: 未接続時は取得しない（No fetch when not connected）

- **GIVEN** ユーザーが Threads に接続していない
- **WHEN** リプライ元選択 UI を展開する
- **THEN** Threads の自投稿取得 API は呼び出されない
- **AND** Bluesky・Misskey の自投稿候補は従来通り表示される

#### Scenario: Threads の取得失敗は他 SNS に影響しない（Fetch failure does not block other SNS）

- **GIVEN** ユーザーが Threads に接続済みだが、Threads の自投稿取得が失敗する状態である
- **WHEN** リプライ元選択 UI を展開する
- **THEN** Bluesky・Misskey の自投稿候補は従来通り表示される
- **AND** リプライ元選択 UI のローディング表示は解除される

#### Scenario: 画像のみの自投稿を候補に含める（Image-only post appears as candidate）

- **GIVEN** ユーザーが Threads に接続済みで、本文を持たない画像のみの投稿が存在する
- **WHEN** リプライ元選択 UI を展開する
- **THEN** 画像のみの投稿も本文を空文字として候補に表示され、エラーで処理が中断しない

#### Scenario: 返信投稿も候補に表示され他 SNS と同一グループになる（Reply posts appear as candidates and group with other SNS）

- **GIVEN** ユーザーが Threads に接続済みで、親投稿が存在する返信を Threads に投稿している
- **AND** 同一内容の投稿を Bluesky・Misskey にも投稿している
- **WHEN** リプライ元選択 UI を展開する
- **THEN** Threads の返信投稿がリプライ元候補に表示される
- **AND** 同一内容の Bluesky・Misskey の投稿と同じグループとして表示される

#### Scenario: トップレベル投稿と返信の一方の取得に失敗しても候補が表示される（Partial fetch failure still shows candidates）

- **GIVEN** ユーザーが Threads に接続済みである
- **AND** `GET /me/threads`（トップレベル投稿）は成功するが `GET /me/replies`（返信）が失敗する状態である
- **WHEN** リプライ元選択 UI を展開する
- **THEN** トップレベル投稿の結果のみがリプライ元候補に表示される
- **AND** Threads の自投稿取得は失敗として扱われない
