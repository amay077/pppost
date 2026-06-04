# threads-posting Specification

## Purpose
Meta OAuth 2.0 + Threads Graph API を用いた Threads アカウント接続・テキスト投稿機能の仕様。
## Requirements
### Requirement: Threads アカウント接続（Connect Threads account via OAuth）

システムは、ユーザーが Threads 接続を要求したとき、`scope=threads_basic,threads_content_publish` を指定した Meta OAuth の認可ページへ、登録済みの `redirect_uri` を用いてリダイレクトしなければならない (SHALL)。認可後にアプリへ戻った際、システムは受け取った認可コードをバックエンド経由で長命アクセストークン（60 日）へ交換し、`user_id` とともに `localStorage` キー `ppp_setting_threads` へ保存しなければならない (SHALL)。`client_secret` をフロントエンドで扱ってはならない (SHALL NOT)。Threads は OOB redirect を許可しないため、認可コードの手動コピー＆ペースト方式を用いてはならない (SHALL NOT)。

#### Scenario: Threads に接続する（Connect to Threads）

- **GIVEN** ユーザーが Threads に未接続である
- **WHEN** 接続ボタンを押下し、Meta の認可ページで許可する
- **THEN** `redirect_uri` でアプリへ戻った後、認可コードがバックエンド経由で長命トークンへ交換される
- **AND** 長命トークンと `user_id` が `ppp_setting_threads` に保存される
- **AND** Threads が「接続済み」として表示され、投稿対象チェックボックスが有効になる

#### Scenario: Threads を切断する（Disconnect Threads）

- **GIVEN** ユーザーが Threads に接続済みである
- **WHEN** 切断ボタンを押下する
- **THEN** `ppp_setting_threads` が削除される
- **AND** Threads の投稿対象チェックボックスが無効化される

#### Scenario: 未接続時は投稿対象に選択できない（Cannot select when not connected）

- **GIVEN** ユーザーが Threads に接続していない
- **WHEN** 投稿対象 SNS の選択肢を確認する
- **THEN** Threads のチェックボックスは無効化されている

### Requirement: Threads へのテキスト投稿（Post text to Threads）

システムは、Threads が投稿対象に選択されているとき、入力テキストをバックエンド経由で Threads へ投稿しなければならない (SHALL)。バックエンドは、メディアコンテナ作成（`media_type=TEXT`）と公開（`creation_id` 指定）の 2 段階で投稿を行わなければならない (SHALL)。MVP では画像およびリプライ先を Threads へ送信してはならない (SHALL NOT)。投稿に失敗した場合、システムは失敗を無言で握りつぶしてはならず (SHALL NOT)、エラー一覧に `Threads` を含めてユーザーへ通知しなければならない (SHALL)。

#### Scenario: テキストを Threads に投稿する（Post text successfully）

- **GIVEN** ユーザーが Threads に接続済みで、投稿対象チェックボックスが ON、本文が入力されている
- **WHEN** 投稿ボタンを押下する
- **THEN** バックエンドがコンテナ作成 → 公開の 2 段階で投稿を完了する
- **AND** Mastodon・Bluesky など他の選択中 SNS への投稿と並行して成功通知が表示される

#### Scenario: 投稿に失敗する（Post fails）

- **GIVEN** ユーザーが Threads を投稿対象に選択している
- **AND** コンテナ作成または公開のいずれかが失敗する状態である
- **WHEN** 投稿ボタンを押下する
- **THEN** エラー一覧に `Threads` が含まれ、ユーザーへ投稿失敗が通知される

### Requirement: Threads 本文の文字数上限（Threads text length limit）

システムは、Threads 本文が 500 文字を超える場合、Threads への投稿を失敗として扱い、ユーザーに通知しなければならない (SHALL)。MVP では Threads 専用の文字数カウンタ表示を設けず、上限超過は Threads API のエラー応答を介して投稿失敗として扱ってよい。

#### Scenario: 500 文字を超える本文（Text exceeds 500 characters）

- **GIVEN** Threads が投稿対象に選択されている
- **AND** 本文が 500 文字を超えている
- **WHEN** 投稿ボタンを押下する
- **THEN** Threads への投稿が失敗する
- **AND** エラー一覧に `Threads` が含まれ、ユーザーへ通知される

## Related Changes

- [2026-06-04-PPP-009-add-threads-posting](../../changes/archive/2026-06-04-PPP-009-add-threads-posting/proposal.md)

