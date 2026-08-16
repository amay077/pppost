# sns-posting Delta

## ADDED Requirements

### Requirement: 投稿失敗原因の分類と伝播（Classify and propagate post failure reasons）

システムは、各 SNS への投稿が失敗したとき、SNS 名だけでなく失敗原因を分類し、ユーザーへの表示に伝播しなければならない (SHALL)。原因は以下のいずれかに分類しなければならない (SHALL): `timeout`（タイムアウト）、`network`（ネットワークエラー）、`auth`（認証エラー、HTTP 401）、`server`（サーバーエラー、HTTP 5xx）、`rejected`（その他の HTTP 4xx）。原因の分類は、HTTP ステータスコードとレスポンスボディのエラー情報に基づいて行わなければならない (SHALL)。バックエンドがエラー情報を JSON で返している場合、システムはそのエラーメッセージを表示に含めてよい (MAY)。

#### Scenario: タイムアウトとして分類される（Classify as timeout）

- **GIVEN** ユーザーが Bluesky を投稿対象に選択している
- **AND** `bluesky_post` への `fetch` がタイムアウト（AbortError）で失敗する状態である
- **WHEN** 投稿処理が `fetch` を実行する
- **THEN** 失敗原因が `timeout` として分類され、エラー表示に伝播される

#### Scenario: 認証エラーとして分類される（Classify as auth error）

- **GIVEN** ユーザーが Threads を投稿対象に選択している
- **AND** `threads_post` が HTTP 401 を返す状態である
- **WHEN** 投稿処理が `threads_post` のレスポンスを受け取る
- **THEN** 失敗原因が `auth` として分類され、エラー表示に伝播される

#### Scenario: サーバーエラーとして分類される（Classify as server error）

- **GIVEN** ユーザーが Misskey を投稿対象に選択している
- **AND** `misskey_post` が HTTP 500 を返す状態である
- **WHEN** 投稿処理が `misskey_post` のレスポンスを受け取る
- **THEN** 失敗原因が `server` として分類され、エラー表示に伝播される

### Requirement: タイムアウト時のリトライ（Retry once on timeout）

システムは、各 SNS への投稿が `timeout`（タイムアウト）または `network`（ネットワークエラー）で失敗した場合、その SNS への投稿を **1 回** だけ自動リトライしなければならない (SHALL)。リトライ後も失敗した場合は、リトライ後の最終的な原因をユーザーへの表示に伝播しなければならない (SHALL)。リトライで成功した場合は、その SNS の投稿は成功として扱わなければならない (SHALL)。`timeout` / `network` 以外の原因（`auth` / `server` / `rejected`）で失敗した場合は、リトライしてはならず (SHALL NOT)、初回の失敗原因をそのまま表示しなければならない (SHALL)。

#### Scenario: タイムアウト後にリトライして成功する（Retry succeeds after timeout）

- **GIVEN** ユーザーが Bluesky を投稿対象に選択している
- **AND** `bluesky_post` への 1 回目の `fetch` がタイムアウトする状態である
- **WHEN** 投稿処理が失敗を検知する
- **THEN** `bluesky_post` への投稿が 1 回だけ自動リトライされる
- **AND** リトライが成功した場合、Bluesky の投稿は成功として扱われる

#### Scenario: リトライ後も失敗した場合は最終的な原因を表示する（Show final reason after retry failure）

- **GIVEN** ユーザーが Bluesky を投稿対象に選択している
- **AND** `bluesky_post` への投稿が 2 回連続でタイムアウトする状態である
- **WHEN** 投稿処理がリトライ後の失敗を検知する
- **THEN** リトライは 2 回目で打ち切られ、`timeout` の原因がエラー表示に伝播される

#### Scenario: 認証エラーではリトライしない（No retry on auth error）

- **GIVEN** ユーザーが Threads を投稿対象に選択している
- **AND** `threads_post` が HTTP 401 を返す状態である
- **WHEN** 投稿処理が失敗を検知する
- **THEN** 自動リトライは実行されず、初回の `auth` 原因がエラー表示に伝播される
