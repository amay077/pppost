# threads-posting Specification

## Overview

BFF 化に伴い、Threads の接続・トークンリフレッシュ・PR ゴースト投稿の各要件を、クライアント（`localStorage`）保管から**サーバー側保管（`credential-custody` capability / Cloudflare D1）**へ移す MODIFIED デルタ。

## MODIFIED Requirements

### Requirement: Threads アカウント接続（Connect Threads account via OAuth）

システムは、ユーザーが Threads 接続を要求したとき、`threads_basic,threads_content_publish,threads_manage_replies` を指定した Meta OAuth の認可ページへ、登録済みの `redirect_uri` を用いてリダイレクトしなければならない (SHALL)。認可後にアプリへ戻った際、システムは受け取った認可コードをバックエンド経由で長命アクセストークン（60 日）へ交換し、`credential-custody` capability に従ってサーバー側の保管庫（Cloudflare D1）へ暗号化保存しなければならない (SHALL)。システムは長命トークンをクライアントへ返し `localStorage` に保存してはならない (SHALL NOT)。クライアントへ返してよいのはセッション ID と表示用メタ（`user_id` 等）に限る。システムは `client_secret` をフロントエンドで扱ってはならない (SHALL NOT)。Threads は OOB redirect を許可しないため、システムは認可コードの手動コピー＆ペースト方式を用いてはならない (SHALL NOT)。

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

### Requirement: Threads 長命トークンの自動リフレッシュ（Auto-refresh long-lived token）

システムは、Threads の長命トークンが取得（または最終更新）から 24 時間以上経過している場合、バックエンド経由で Threads API（`grant_type=th_refresh_token`）を呼び出してトークンをリフレッシュしなければならない (SHALL)。システムはリフレッシュ可否の判定とリフレッシュ実行をサーバー側で行い、保管庫（D1）の該当トークンと更新時刻を更新しなければならない (SHALL)。Threads API の制約により、システムは取得から 24 時間未満のトークンをリフレッシュしてはならない (SHALL NOT)。システムはリフレッシュ後の新トークンをクライアントへ返してはならない (SHALL NOT)。リフレッシュに失敗した場合、システムは既存の保管トークンと接続状態を維持しなければならず (SHALL)、保管済みトークンを削除してはならない (SHALL NOT)。失効済みトークンによる投稿失敗は、既存のエラー通知要件（エラー一覧に `Threads` を含めて通知）で処理する。

#### Scenario: 24 時間経過後にサーバーがトークンを更新する（Server refreshes after 24 hours）

- **GIVEN** ユーザーが Threads に接続済みで、保管トークンの最終更新から 24 時間以上経過している
- **WHEN** リフレッシュ判定の契機（アプリ起動時のサーバー問い合わせ、または次の投稿時）が発生する
- **THEN** バックエンドが Threads API のリフレッシュを呼び出す
- **AND** 新しいトークンと更新時刻が D1 に保存される（クライアントにはトークンは返らない）

#### Scenario: 24 時間未満ではリフレッシュしない（No refresh within 24 hours）

- **GIVEN** 保管トークンの最終更新から 24 時間未満である
- **WHEN** リフレッシュ判定が行われる
- **THEN** リフレッシュ API は呼び出されず、保管トークンは変更されない

#### Scenario: リフレッシュ失敗時も接続状態を維持する（Keep connection on refresh failure）

- **GIVEN** 24 時間以上経過しているが、リフレッシュ API が失敗する状態である
- **WHEN** リフレッシュを試行する
- **THEN** 既存の保管トークンは維持され、削除されない
- **AND** Threads は「接続済み」のまま表示される

### Requirement: PR ゴースト投稿設定の管理（Manage PR ghost post settings）

システムは、ユーザーが PR ゴースト投稿の設定（有効/無効・付与間隔（時間、既定 48）・PR 文の一覧）を編集でき、これをサーバー側（Cloudflare D1）にセッション ID 単位で保存しなければならない (SHALL)。システムは実行状態（前回 PR を出した時刻・次に使う PR 文の位置）も同様に D1 に保持しなければならない (SHALL)。システムは PR 設定・状態・トークンを `localStorage` に保存してはならない (SHALL NOT)。システムは PR ゴースト投稿の設定 UI を Threads に接続済みのときのみ表示し (SHALL)、未接続時は表示してはならない (SHALL NOT)。各 PR 文はゴースト投稿の制約に従い 500 文字以内とし、システムは上限超過をユーザーに知らせなければならない (SHALL)。

#### Scenario: PR 設定をサーバーに保存する（Save PR settings server-side）

- **GIVEN** ユーザーが Threads に接続済みである
- **WHEN** PR ゴースト投稿を有効にし、間隔と PR 文を入力する
- **THEN** 設定がセッション ID に紐づけて D1 に保存される（`localStorage` には保存されない）

#### Scenario: 未接続時は設定 UI を表示しない（No settings UI when not connected）

- **GIVEN** ユーザーが Threads に接続していない
- **WHEN** Threads の設定欄を開く
- **THEN** PR ゴースト投稿の設定 UI は表示されない

### Requirement: PR ゴースト投稿の自動付与（Auto-append PR ghost post）

システムは、本投稿が成功し、かつ「投稿対象に Threads が含まれ Threads 本投稿が成功」「PR 設定が有効で PR 文が 1 つ以上」「前回 PR を出した時刻からの経過が設定間隔以上（D1 に実行状態が未作成、または前回 PR を出した時刻が未設定＝未投稿の場合は経過済みとみなす）」のすべてを満たすときに限り、PR 文を 1 つ選んでゴースト投稿として自動追加投稿しなければならない (SHALL)。システムは間隔判定をサーバー側（D1 の実行状態）で行わなければならず (SHALL)、クライアントが送る値で判定してはならない (SHALL NOT)。これにより `localStorage` 改変などクライアント側の操作で間隔ゲートを回避できないようにする。システムは PR 文を登録順にローテーションして選択しなければならない (SHALL)。PR ゴースト投稿が成功したときのみ、システムは D1 の実行状態（前回時刻・ローテーション位置）を更新しなければならない (SHALL)。PR ゴースト投稿が成功に至らなかったすべての場合、システムは状態を更新してはならない (SHALL NOT)。システムは PR ゴースト投稿の失敗を本投稿の成否へ影響させてはならず (SHALL NOT)、本投稿の成功通知やエラー一覧に PR の失敗を含めてはならない (SHALL NOT)。

#### Scenario: サーバー判定で間隔経過後に PR が付与される（Server judges interval, PR appended）

- **GIVEN** Threads を投稿対象に選択し、PR 設定が有効で PR 文が登録されている
- **AND** サーバー保管の実行状態で前回 PR から設定間隔以上が経過している
- **WHEN** 本投稿が成功する
- **THEN** サーバー判定により PR 文が 1 つ選ばれ、直後に独立したゴースト投稿として公開される
- **AND** D1 の実行状態（前回時刻・ローテーション位置）が更新される

#### Scenario: 間隔内では PR が付与されない（No PR within interval）

- **GIVEN** PR 設定が有効だが、サーバー保管の実行状態で前回 PR から設定間隔が経過していない
- **WHEN** 本投稿が成功する
- **THEN** PR ゴースト投稿は行われない

#### Scenario: クライアント改変で間隔ゲートを回避できない（Client tampering cannot bypass gate）

- **GIVEN** 前回 PR から設定間隔が経過していない
- **AND** クライアント側の値が経過済みであるかのように改変されている
- **WHEN** 本投稿が成功する
- **THEN** サーバーが自身の保管状態で判定するため、PR ゴースト投稿は行われない

#### Scenario: 実行状態が未作成/未投稿の初回は PR が付与される（First run with no prior state appends PR）

- **GIVEN** Threads を投稿対象に選択し、PR 設定が有効で PR 文が登録されている
- **AND** D1 に当該セッションの実行状態が未作成、または前回 PR を出した時刻が未設定（未投稿）である
- **WHEN** 本投稿が成功する
- **THEN** 経過済みとみなされ、PR 文が 1 つ選ばれてゴースト投稿として公開される
- **AND** D1 の実行状態（前回時刻・ローテーション位置）が新規作成または更新される

#### Scenario: Threads 本投稿が失敗したら付与しない（No PR when Threads post failed）

- **GIVEN** PR 設定が有効で間隔も経過しているが、Threads への本投稿が失敗する状態である
- **WHEN** 投稿ボタンを押下する
- **THEN** サーバーは PR ゴースト投稿を行わず、D1 の実行状態も更新しない

#### Scenario: PR 投稿失敗は本投稿に影響しない（PR failure does not affect main post）

- **GIVEN** 本投稿は成功したが、PR ゴースト投稿が失敗する状態である
- **WHEN** 投稿処理が完了する
- **THEN** 本投稿は成功として通知され、エラー一覧に PR の失敗は含まれない
- **AND** サーバーは D1 の実行状態を更新せず、次回の本投稿で再試行される
