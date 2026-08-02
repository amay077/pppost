## MODIFIED Requirements

<!-- 本デルタは PPP-029-remove-mastodon-posting 適用後の本文（Mastodon を含まない列挙）をベースにしている。 -->

### Requirement: SNS トークンのサーバー暗号化保管（Server-side encrypted token storage）

システムは、OAuth/ログインで得た各 SNS のトークン（Threads の長命トークン、Bluesky の session データ、Misskey の MiAuth アクセストークン）を、サーバー側の Cloudflare D1 に AES で暗号化して保存しなければならない (SHALL)。暗号化はレコードごとにランダムな IV を用いなければならない (SHALL)。保管に用いる鍵はサーバー側（実行基盤の secrets / 環境変数）にのみ置かなければならず (SHALL)、クライアントへ渡してはならない (SHALL NOT)。D1 へのアクセスは実行基盤のバインディングで行わなければならず (SHALL)、その方式は `backend-hosting` capability の規定に従う。システムは取得・交換したトークンをクライアントへ返してはならない (SHALL NOT)。接続完了時にクライアントへ返してよいのは、セッション ID と表示用メタ情報（アカウント識別子・ハンドル・接続先ホスト等）に限る。

#### Scenario: 接続時にトークンがサーバーへ保存される（Token stored server-side on connect）

- **GIVEN** ユーザーがある SNS の認可を完了した
- **WHEN** バックエンドがトークンを取得する
- **THEN** トークンは AES 暗号化されて D1 に保存される
- **AND** レスポンスにはセッション ID と表示用メタのみが含まれ、トークンは含まれない

#### Scenario: クライアントにトークンが露出しない（Token never exposed to client）

- **GIVEN** ユーザーが SNS に接続済みである
- **WHEN** `localStorage` とネットワーク応答を確認する
- **THEN** SNS トークンはどこにも現れず、存在するのはセッション ID と表示用メタのみである

#### Scenario: 鍵・認証情報がクライアントへ渡らない（Keys and credentials stay server-side）

- **GIVEN** バックエンドが暗号化鍵と D1 バインディングを用いて稼働している
- **WHEN** クライアントへ返されるレスポンスと配信されるフロントエンドの成果物を確認する
- **THEN** 暗号化鍵およびストレージへの認証情報はいずれにも含まれない
