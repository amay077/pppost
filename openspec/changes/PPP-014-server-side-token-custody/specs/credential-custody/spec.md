# credential-custody Specification

## Overview

SNS 投稿用トークンをサーバー側（Cloudflare D1）に暗号化保管し、クライアントには不透明なセッション ID のみを持たせる BFF 化の capability。個人単一ユーザー前提の匿名セッションを Bearer で認可する。

## ADDED Requirements

### Requirement: サーバー発行の匿名セッション（Server-issued anonymous session）

システムは、クライアントが最初に SNS 接続を確立するとき、クライアントがまだセッション ID を持たない場合に、サーバー側で高エントロピーな不透明セッション ID を生成し、サーバーの保管庫にレコードを作成して、そのセッション ID のみをクライアントへ返さなければならない (SHALL)。クライアントはこれを `localStorage`（`ppp_session_id`）に保存する。以降の保管トークンを要する API 呼び出しを、システムは `Authorization: Bearer <session_id>` により認可しなければならない (SHALL)。セッション ID に対応する保管レコードが存在しない場合、システムは当該操作を認可してはならない (SHALL NOT)。本 capability は個人単一ユーザー前提であり、ユーザー名・パスワード等のログインを要求してはならない (SHALL NOT)。

#### Scenario: 初回接続でセッションが発行される（Session issued on first connect）

- **GIVEN** クライアントがまだ `ppp_session_id` を持たない
- **WHEN** いずれかの SNS への接続を完了する
- **THEN** サーバーが不透明なセッション ID を発行し、保管レコードを作成する
- **AND** クライアントはセッション ID のみを受け取り `ppp_session_id` に保存する（SNS トークンは受け取らない）

#### Scenario: 既存セッションで追加接続する（Additional connect reuses session）

- **GIVEN** クライアントが既に `ppp_session_id` を持つ
- **WHEN** 別の SNS への接続を完了する
- **THEN** 同じセッション ID の保管レコードに当該 SNS のトークンが追記される

#### Scenario: 無効なセッションは認可されない（Invalid session is rejected）

- **GIVEN** 存在しない（未発行、または削除済みを含む）セッション ID が提示される
- **WHEN** 保管トークンを要する API を呼び出す
- **THEN** その操作は認可されず、トークンは使用されない

### Requirement: SNS トークンのサーバー暗号化保管（Server-side encrypted token storage）

システムは、OAuth/ログインで得た各 SNS のトークン（Threads の長命トークン、Mastodon の access_token、Bluesky の session データ）を、サーバー側の Cloudflare D1 に AES で暗号化して保存しなければならない (SHALL)。暗号化はレコードごとにランダムな IV を用いなければならない (SHALL)。保管に用いる鍵・Cloudflare の認証情報はサーバー側（環境変数）にのみ置き、クライアントへ渡してはならない (SHALL NOT)。システムは取得・交換したトークンをクライアントへ返してはならない (SHALL NOT)。接続完了時にクライアントへ返してよいのは、セッション ID と表示用メタ情報（アカウント識別子・ハンドル等）に限る。

#### Scenario: 接続時にトークンがサーバーへ保存される（Token stored server-side on connect）

- **GIVEN** ユーザーがある SNS の認可を完了した
- **WHEN** バックエンドがトークンを取得する
- **THEN** トークンは AES 暗号化されて D1 に保存される
- **AND** レスポンスにはセッション ID と表示用メタのみが含まれ、トークンは含まれない

#### Scenario: クライアントにトークンが露出しない（Token never exposed to client）

- **GIVEN** ユーザーが SNS に接続済みである
- **WHEN** `localStorage` とネットワーク応答を確認する
- **THEN** SNS トークンはどこにも現れず、存在するのはセッション ID と表示用メタのみである

### Requirement: 保管トークンによる操作の実行（Operate using stored tokens）

システムは、投稿・自投稿取得・トークンリフレッシュ等のトークンを要する操作を、クライアントから受け取ったトークンではなく、セッション ID に紐づく保管庫のトークンを復号して実行しなければならない (SHALL)。システムはクライアントからトークンを受け取って使用してはならない (SHALL NOT)。対象セッションに当該 SNS のトークンが保管されていない場合、システムはその SNS への操作を行わず、失敗として扱わなければならない (SHALL)。

#### Scenario: 保管トークンで投稿する（Post using stored token）

- **GIVEN** セッションに Threads/Mastodon/Bluesky のトークンが保管されている
- **WHEN** クライアントが Bearer セッションのみを付けて投稿を要求する
- **THEN** バックエンドは保管トークンを復号して各 SNS へ投稿する

#### Scenario: 未保管の SNS への操作は失敗する（Operation fails when token not stored）

- **GIVEN** セッションに当該 SNS のトークンが保管されていない
- **WHEN** その SNS への操作を要求する
- **THEN** 操作は行われず、失敗として扱われる

### Requirement: 保管トークンの削除（切断）（Delete stored token on disconnect）

システムは、ユーザーがある SNS の切断を要求したとき、`Authorization: Bearer <session_id>` で認可し、該当セッション ID × 当該 SNS の保管トークンを保管庫（Cloudflare D1）から削除しなければならない (SHALL)。削除の対象は要求された SNS のトークンに限り、システムは同一セッションに保管された他の SNS のトークンを削除してはならない (SHALL NOT)。削除後、システムは当該 SNS を未接続として扱わなければならない (SHALL)。この削除処理は Threads・Mastodon・Bluesky のすべての切断で共通に適用される。

#### Scenario: 切断で保管トークンが削除される（Stored token deleted on disconnect）

- **GIVEN** セッションにある SNS のトークンが保管されている
- **WHEN** その SNS の切断を要求する
- **THEN** 保管庫から当該セッション ID × 当該 SNS のトークンが削除される
- **AND** その SNS は未接続として扱われる

#### Scenario: 切断は他の SNS のトークンに影響しない（Disconnect does not affect other SNS tokens）

- **GIVEN** 同一セッションに複数の SNS のトークンが保管されている
- **WHEN** そのうち 1 つの SNS の切断を要求する
- **THEN** 要求された SNS のトークンのみが削除され、他の SNS のトークンは保持される
