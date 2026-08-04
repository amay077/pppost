## MODIFIED Requirements

### Requirement: SNS トークンのサーバー暗号化保管（Server-side encrypted token storage）

システムは、OAuth/ログインで得た各 SNS のトークン（Threads の長命トークン、Bluesky の session データ、Misskey の MiAuth アクセストークン）を、サーバー側の Cloudflare D1 に AES で暗号化して保存しなければならない (SHALL)。暗号化はレコードごとにランダムな IV を用いなければならない (SHALL)。保管に用いる鍵・Cloudflare の認証情報はサーバー側（環境変数）にのみ置き、クライアントへ渡してはならない (SHALL NOT)。システムは取得・交換したトークンをクライアントへ返してはならない (SHALL NOT)。接続完了時にクライアントへ返してよいのは、セッション ID と表示用メタ情報（アカウント識別子・ハンドル・接続先ホスト等）に限る。

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

- **GIVEN** セッションに Threads/Bluesky/Misskey のトークンが保管されている
- **WHEN** クライアントが Bearer セッションのみを付けて投稿を要求する
- **THEN** バックエンドは保管トークンを復号して各 SNS へ投稿する

#### Scenario: 未保管の SNS への操作は失敗する（Operation fails when token not stored）

- **GIVEN** セッションに当該 SNS のトークンが保管されていない
- **WHEN** その SNS への操作を要求する
- **THEN** 操作は行われず、失敗として扱われる

### Requirement: 保管トークンの削除（切断）（Delete stored token on disconnect）

システムは、ユーザーがある SNS の切断を要求したとき、`Authorization: Bearer <session_id>` で認可し、該当セッション ID × 当該 SNS の保管トークンを保管庫（Cloudflare D1）から削除しなければならない (SHALL)。削除の対象は要求された SNS のトークンに限り、システムは同一セッションに保管された他の SNS のトークンを削除してはならない (SHALL NOT)。削除後、システムは当該 SNS を未接続として扱わなければならない (SHALL)。この削除処理は Threads・Bluesky・Misskey のすべての切断で共通に適用される。

#### Scenario: 切断で保管トークンが削除される（Stored token deleted on disconnect）

- **GIVEN** セッションにある SNS のトークンが保管されている
- **WHEN** その SNS の切断を要求する
- **THEN** 保管庫から当該セッション ID × 当該 SNS のトークンが削除される
- **AND** その SNS は未接続として扱われる

#### Scenario: 切断は他の SNS のトークンに影響しない（Disconnect does not affect other SNS tokens）

- **GIVEN** 同一セッションに複数の SNS のトークンが保管されている
- **WHEN** そのうち 1 つの SNS の切断を要求する
- **THEN** 要求された SNS のトークンのみが削除され、他の SNS のトークンは保持される
