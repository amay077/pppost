# bluesky-oauth Specification

## Overview

Bluesky 接続の OAuth 化に関する仕様。AT Protocol OAuth（authorization code + PKCE + DPoP）による接続、OAuth セッションのサーバー保管（credential-custody 準拠）、投稿・自投稿取得でのセッション利用、パスワードログインの廃止を定める。

## ADDED Requirements

### Requirement: Bluesky の OAuth 接続（Connect Bluesky via OAuth）

システムは、ユーザーが Bluesky 接続を要求したとき、バックエンドが AT Protocol OAuth（authorization code + PKCE + DPoP）の認可フローを処理しなければならない (SHALL)。クライアント metadata（`client_id`・`redirect_uris`・`scope: atproto` 等）と JWKS を公開 URL で公開しなければならない (SHALL)。`client_id` は metadata の公開 URL でなければならない (SHALL)。

システムは、認可完了後に得た OAuth セッションを `credential-custody` に従ってサーバー側の保管庫（Cloudflare D1）に暗号化保存しなければならない (SHALL)。システムは OAuth セッションをクライアントへ返してはならない (SHALL NOT)。クライアントへ返してよいのはセッション ID と表示用メタ（handle・did 等）に限る。認可フロー中の一時状態（PKCE verifier・state 等）はサーバー側で管理しなければならず (SHALL)、クライアントに保持させてはならない (SHALL NOT)。

#### Scenario: OAuth で Bluesky に接続する（Connect to Bluesky via OAuth）

- **GIVEN** ユーザーが Bluesky に未接続である
- **WHEN** ハンドルを入力して接続操作を行い、別タブで開いた認可ページで許可し、アプリで接続完了を指示する
- **THEN** バックエンドが認可コードをトークンへ交換し、OAuth セッションを D1 に暗号化保存する
- **AND** クライアントにはセッション ID と表示用メタのみが返り、OAuth セッションは返らない
- **AND** Bluesky が「接続済み」として表示され、投稿対象チェックボックスが有効になる

#### Scenario: 認可前に接続完了を指示する（Complete pressed before authorization）

- **GIVEN** ユーザーが認可ページでまだ許可していない
- **WHEN** アプリで接続完了を指示する
- **THEN** OAuth セッションは得られず、接続は成立せず、失敗がユーザーへ通知される
- **AND** Bluesky は「未接続」のままで、投稿対象チェックボックスは無効のままである

### Requirement: OAuth セッションによる投稿と自投稿取得（Post and fetch using OAuth session）

システムは、投稿・自投稿取得などのトークンを要する Bluesky 操作を、保管した OAuth セッションを復元して実行しなければならない (SHALL)。アクセストークンが期限切れの場合、システムはバックエンド側で OAuth のリフレッシュを行い、新たなトークンを保管庫へ保存しなければならない (SHALL)。システムはクライアントから Bluesky の認証情報（パスワード・トークン等）を受け取って使用してはならない (SHALL NOT)。

対象セッションに Bluesky の OAuth セッションが保管されていない場合、システムは Bluesky への操作を行わず、失敗として扱わなければならない (SHALL)。

#### Scenario: 保管した OAuth セッションで投稿する（Post using stored OAuth session）

- **GIVEN** セッションに Bluesky の OAuth セッションが保管されている
- **WHEN** クライアントが Bearer セッションのみを付けて Bluesky への投稿を要求する
- **THEN** バックエンドは保管した OAuth セッションを復元して投稿する

#### Scenario: アクセストークン期限切れ時に自動リフレッシュする（Refresh expired access token）

- **GIVEN** 保管した OAuth セッションのアクセストークンが期限切れである
- **WHEN** 投稿または自投稿取得を要求する
- **THEN** バックエンドがリフレッシュトークンでアクセストークンを更新する
- **AND** 更新後のセッションが保管庫に保存され、操作が成功する

#### Scenario: 未保管のセッションへの操作は失敗する（Operation fails when session not stored）

- **GIVEN** セッションに Bluesky の OAuth セッションが保管されていない
- **WHEN** Bluesky への投稿または自投稿取得を要求する
- **THEN** 操作は行われず、失敗として扱われる

### Requirement: パスワードログインの廃止（Remove password login）

システムは、Bluesky への接続に ID/パスワード（アプリパスワード）ログインを使用してはならない (SHALL NOT)。パスワードログイン用の API（`bluesky_login` 相当）を提供してはならない (SHALL NOT)。接続 UI に ID/パスワードの入力欄を表示してはならない (SHALL NOT)。パスワードログインで接続済みのユーザーの保管セッションは、有効期間中は投稿・自投稿取得に利用できなければならない (SHALL)。

#### Scenario: 接続 UI にパスワード入力欄が表示されない（No password input in connect UI）

- **GIVEN** ユーザーが Bluesky の接続 UI を開いている
- **WHEN** 接続 UI を確認する
- **THEN** ID/パスワードの入力欄は表示されず、OAuth 接続の操作のみが表示される

#### Scenario: 既存のパスワードセッションは有効期間中利用できる（Existing password session usable while valid）

- **GIVEN** パスワードログイン時代に接続し、保管済みセッションが有効である
- **WHEN** 投稿または自投稿取得を要求する
- **THEN** 保管済みセッションで操作が成功する（OAuth 化後も再接続不要）
