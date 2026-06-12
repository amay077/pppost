# threads-posting Specification

## Purpose
Meta OAuth 2.0 + Threads Graph API を用いた Threads アカウント接続・テキスト/画像投稿・長命トークン自動リフレッシュ機能の仕様。
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

### Requirement: Threads 本文の文字数上限（Threads text length limit）

システムは、Threads 本文が 500 文字を超える場合、Threads への投稿を失敗として扱い、ユーザーに通知しなければならない (SHALL)。MVP では Threads 専用の文字数カウンタ表示を設けず、上限超過は Threads API のエラー応答を介して投稿失敗として扱ってよい。

#### Scenario: 500 文字を超える本文（Text exceeds 500 characters）

- **GIVEN** Threads が投稿対象に選択されている
- **AND** 本文が 500 文字を超えている
- **WHEN** 投稿ボタンを押下する
- **THEN** Threads への投稿が失敗する
- **AND** エラー一覧に `Threads` が含まれ、ユーザーへ通知される

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

### Requirement: Threads 長命トークンの自動リフレッシュ（Auto-refresh long-lived token）

システムは、アプリ起動時に Threads の長命トークンが取得から 24 時間以上経過している場合、バックエンド経由で Threads API（`grant_type=th_refresh_token`）を呼び出してトークンをリフレッシュしなければならない (SHALL)。Threads API の制約により、取得から 24 時間未満のトークンをリフレッシュしてはならない (SHALL NOT)。

リフレッシュに成功した場合、システムは新しい `access_token` / `token_type` / `expires_in` と更新時刻（`obtained_at`）を `localStorage` キー `ppp_setting_threads` の `token_data` へ保存しなければならない (SHALL)。

リフレッシュに失敗した場合、システムは既存のトークンと接続状態を維持しなければならず (SHALL)、保存済みトークンを削除してはならない (SHALL NOT)。失効済みトークンによる投稿失敗は、既存のエラー通知要件（エラー一覧に `Threads` を含めて通知）で処理する。

`client_secret` をフロントエンドで扱ってはならない (SHALL NOT)（リフレッシュ API は `client_secret` 不要だが、呼び出しは既存構成に合わせてバックエンド経由とする）。

リフレッシュ可否の判定は `obtained_at` からの経過時間のみで行う（`expires_in` は判定に使用しない）。Threads API の制約が「取得から 24 時間以上経過」であるため、残り寿命ではなく経過時間が判定基準となる。OAuth 接続直後の起動では経過時間が 24 時間未満のため、リフレッシュは自然に行われない。

#### Scenario: 24 時間経過後の起動でトークンが更新される（Refresh on launch after 24 hours）

- **GIVEN** ユーザーが Threads に接続済みで、`token_data.obtained_at` から 24 時間以上経過している
- **WHEN** アプリを起動する
- **THEN** バックエンド経由で Threads API のリフレッシュが呼び出される
- **AND** 新しい `access_token` と更新後の `obtained_at` が `ppp_setting_threads` に保存される
- **AND** Threads は「接続済み」のまま表示される

#### Scenario: 24 時間未満ではリフレッシュしない（No refresh within 24 hours）

- **GIVEN** ユーザーが Threads に接続済みで、`token_data.obtained_at` から 24 時間未満である
- **WHEN** アプリを起動する
- **THEN** リフレッシュ API は呼び出されない
- **AND** `token_data` は変更されない

#### Scenario: リフレッシュ失敗時も接続状態を維持する（Keep connection on refresh failure）

- **GIVEN** ユーザーが Threads に接続済みで、`token_data.obtained_at` から 24 時間以上経過している
- **AND** リフレッシュ API が失敗する状態である（ネットワークエラーやトークン失効など）
- **WHEN** アプリを起動する
- **THEN** 既存の `token_data` が維持され、削除されない
- **AND** Threads は「接続済み」のまま表示される
- **AND** トークンが失効していた場合、投稿時にエラー一覧へ `Threads` が含まれて通知される（既存要件）

#### Scenario: 未接続時は何もしない（No-op when not connected）

- **GIVEN** ユーザーが Threads に接続していない（`ppp_setting_threads` が存在しない）
- **WHEN** アプリを起動する
- **THEN** リフレッシュ API は呼び出されない

## Related Changes

- [2026-06-04-PPP-009-add-threads-posting](../../changes/archive/2026-06-04-PPP-009-add-threads-posting/proposal.md)
- [2026-06-12-PPP-010-add-threads-image-posting](../../changes/archive/2026-06-12-PPP-010-add-threads-image-posting/proposal.md)
- [2026-06-12-PPP-011-add-threads-token-refresh](../../changes/archive/2026-06-12-PPP-011-add-threads-token-refresh/proposal.md)

