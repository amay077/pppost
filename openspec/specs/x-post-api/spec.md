# x-post-api Specification

## Purpose
macOS 上の Chrome にログイン済みの X アカウントを操作してテキストを投稿する、ローカル HTTP API の振る舞いを定める。API はループバックアドレスにのみ bind し、Bearer 認証、冪等性、排他制御、レート制限、監査ログ、CORS を備える。Docker の Tailscale コンテナを tailnet の入口とし、`tailscale funnel` は使わない。
## Requirements
### Requirement: 起動設定の検証（Validate startup configuration）

x-post-api は、起動時に `X_API_TOKEN` と `X_ACCOUNT` を必須とし、未設定または不正な場合は起動を中止しなければならない (SHALL)。`X_API_BIND` はループバックアドレスに限定し、`0.0.0.0` などの外部公開アドレスが指定された場合は起動を中止しなければならない (SHALL NOT)。

#### Scenario: 必須設定が欠けている（Missing required configuration）

- **GIVEN** `X_API_TOKEN` または `X_ACCOUNT` が設定されていない
- **WHEN** x-post-api を起動する
- **THEN** 起動は中止され、不足している設定名が標準エラー出力に表示される

#### Scenario: 外部公開アドレスが指定された（Non-loopback bind address）

- **GIVEN** `X_API_BIND=0.0.0.0` が指定されている
- **WHEN** x-post-api を起動する
- **THEN** 起動は中止され、ループバックアドレスのみ許可する旨が表示される

### Requirement: Bearer 認証（Bearer authentication）

x-post-api は、`GET /health` と `POST /post` のすべてで `Authorization: Bearer <token>` を要求しなければならない (SHALL)。トークンの比較には `hmac.compare_digest` を用いなければならない (SHALL)。トークンが欠落または不一致の場合は 401 `UNAUTHORIZED` を返さなければならない (SHALL)。`OPTIONS` のプリフライトは認証を要求してはならない (SHALL NOT)。

#### Scenario: 正しいトークンで認証する（Valid token）

- **GIVEN** 正しい `X_API_TOKEN` が設定されている
- **WHEN** `Authorization: Bearer <token>` 付きで API を呼び出す
- **THEN** 認証が成功し、要求された処理が実行される

#### Scenario: 誤ったトークンで認証する（Invalid token）

- **GIVEN** 誤ったトークンが指定されている
- **WHEN** API を呼び出す
- **THEN** 401 `UNAUTHORIZED` が返り、投稿は行われない

#### Scenario: プリフライトは認証不要（Preflight does not require auth）

- **GIVEN** ブラウザが CORS プリフライトを送信する
- **WHEN** `OPTIONS /post` を認証ヘッダーなしで呼び出す
- **THEN** 204 と CORS ヘッダーが返り、認証エラーにはならない

### Requirement: ヘルスチェック（Health check）

x-post-api は、`GET /health` で API の稼働、Chrome タブの有無、対象アカウントでのログイン、投稿欄の有無、排他状態、最終投稿時刻を返さなければならない (SHALL)。ヘルスチェックは投稿を行ってはならない (SHALL NOT)。

#### Scenario: 正常な状態（Healthy）

- **GIVEN** Chrome が起動し、対象アカウントの X タブと投稿欄がある
- **WHEN** `GET /health` を呼び出す
- **THEN** `ok: true`、`chrome_tab: true`、`logged_in: true`、`composer_ready: true` が返る
- **AND** 投稿は行われない

#### Scenario: Chrome が起動していない（Chrome is not running）

- **GIVEN** Chrome が起動していない
- **WHEN** `GET /health` を呼び出す
- **THEN** `ok: false`、`chrome_tab: false` が返り、エラーコード `NO_CHROME_TAB` が含まれる

#### Scenario: 対象アカウントのタブがない（No account tab）

- **GIVEN** X のタブはあるが、対象アカウントでログインしていない
- **WHEN** `GET /health` を呼び出す
- **THEN** `ok: false`、`logged_in: false` が返り、エラーコード `NO_ACCOUNT` が含まれる

### Requirement: テキスト投稿（Post text）

x-post-api は、`POST /post` で `text` を受け取り、X の投稿欄へ入力して投稿しなければならない (SHALL)。改行は保持し、前後の空白は削除しなければならない (SHALL)。任意の `url` が指定された場合は、本文の末尾に改行して付加しなければならない (SHALL)。`dry_run: true` の場合は検証のみを行い、Chrome を操作してはならない (SHALL NOT)。

#### Scenario: テキストを投稿する（Post text successfully）

- **GIVEN** Chrome が起動し、対象アカウントの X タブと空の投稿欄がある
- **WHEN** `POST /post` に `{"text": "投稿する本文"}` を送る
- **THEN** 投稿欄に本文が入力され、投稿ボタンが 1 回だけクリックされる
- **AND** 200 と `posted_at`、`weighted_length`、`request_id` が返る

#### Scenario: URL を付加する（Append URL）

- **GIVEN** 本文と URL が指定されている
- **WHEN** `POST /post` に `{"text": "本文", "url": "https://example.com"}` を送る
- **THEN** 投稿欄には「本文」の後に改行と URL が入力される
- **AND** 文字数は URL を 23 として計算される

#### Scenario: dry_run では投稿しない（Dry run does not post）

- **GIVEN** 有効な本文が指定されている
- **WHEN** `POST /post` に `{"text": "本文", "dry_run": true}` を送る
- **THEN** 検証結果のみが返り、Chrome の投稿欄は操作されない

### Requirement: 重み付き文字数（Weighted character count）

x-post-api は、X の仕様に合わせて文字数を計算しなければならない (SHALL)。URL は 23、東アジア文字（ひらがな・カタカナ・漢字・ハングル・全角記号）は 2、それ以外は 1 とし、上限を 280 としなければならない (SHALL)。

#### Scenario: 日本語の文字数を計算する（Count Japanese text）

- **GIVEN** 本文がひらがな・カタカナ・漢字のみで構成されている
- **WHEN** 文字数を計算する
- **THEN** 各文字は 2 として集計される

#### Scenario: URL の文字数を計算する（Count URLs）

- **GIVEN** 本文に `https://example.com` が含まれている
- **WHEN** 文字数を計算する
- **THEN** その URL は文字列の長さにかかわらず 23 として集計される

#### Scenario: 上限を超える（Exceed the limit）

- **GIVEN** 本文の重み付き文字数が 280 を超えている
- **WHEN** `POST /post` を呼び出す
- **THEN** 400 `TOO_LONG` が返り、投稿は行われない

### Requirement: 入力検証（Input validation）

x-post-api は、本文が空または空白のみの場合は 400 `EMPTY_TEXT` を返さなければならない (SHALL)。改行・タブ以外の制御文字を含む場合は 400 `INVALID_TEXT` を返さなければならない (SHALL)。`url` が `http` または `https` 以外のスキームの場合は 400 `INVALID_URL` を返さなければならない (SHALL)。JSON として解釈できない場合は 400 `INVALID_JSON` を返さなければならない (SHALL)。

#### Scenario: 空の本文（Empty text）

- **GIVEN** `text` が空文字または空白のみである
- **WHEN** `POST /post` を呼び出す
- **THEN** 400 `EMPTY_TEXT` が返り、投稿は行われない

#### Scenario: 制御文字を含む（Control characters）

- **GIVEN** 本文に `\x00` などの制御文字が含まれている
- **WHEN** `POST /post` を呼び出す
- **THEN** 400 `INVALID_TEXT` が返り、投稿は行われない

#### Scenario: 不正な URL スキーム（Invalid URL scheme）

- **GIVEN** `url` が `ftp://example.com` である
- **WHEN** `POST /post` を呼び出す
- **THEN** 400 `INVALID_URL` が返り、投稿は行われない

### Requirement: 対象アカウントのタブ選択（Select the target account tab）

x-post-api は、複数の X タブがある場合でも、サイドバーのアカウント表示が `X_ACCOUNT` と一致するタブだけを使用しなければならない (SHALL)。一致するタブがない場合は 409 `NO_ACCOUNT` を返さなければならない (SHALL)。Chrome または X のタブがない場合は 503 `NO_CHROME_TAB` を返さなければならない (SHALL)。

#### Scenario: 対象アカウントのタブを選ぶ（Select the matching tab）

- **GIVEN** 複数の X タブがあり、1 つだけ `X_ACCOUNT` と一致する
- **WHEN** 投稿を実行する
- **THEN** 一致するタブだけが使用され、他のアカウントのタブは操作されない

#### Scenario: 一致するタブがない（No matching tab）

- **GIVEN** X のタブはあるが、`X_ACCOUNT` と一致しない
- **WHEN** 投稿を実行する
- **THEN** 409 `NO_ACCOUNT` が返り、投稿は行われない

### Requirement: 下書き保護（Protect existing drafts）

x-post-api は、投稿欄に既存のテキストがある場合、それを上書きしてはならない (SHALL NOT)。下書きがある場合は 409 `DRAFT_EXISTS` を返し、下書きをそのまま残さなければならない (SHALL)。

#### Scenario: 下書きがある（Draft exists）

- **GIVEN** X の投稿欄に既存のテキストがある
- **WHEN** `POST /post` を呼び出す
- **THEN** 409 `DRAFT_EXISTS` が返り、投稿欄のテキストは変更されない

### Requirement: 投稿結果の確認（Verify the posting result）

x-post-api は、投稿ボタンをクリックした後、投稿欄が空になったこと、またはトーストに送信完了を示す文言が出たことを確認しなければならない (SHALL)。どちらも確認できない場合は 502 `UNKNOWN_STATE` を返さなければならない (SHALL)。

#### Scenario: 投稿欄が空になる（Composer becomes empty）

- **GIVEN** 投稿ボタンが 1 回クリックされた
- **WHEN** 3 秒後に投稿欄を確認する
- **THEN** 投稿欄が空であれば成功として扱う

#### Scenario: 結果を確認できない（Unknown state）

- **GIVEN** 投稿ボタンが 1 回クリックされた
- **WHEN** 3 秒後に投稿欄もトーストも確認できない
- **THEN** 502 `UNKNOWN_STATE` が返り、再投稿は行われない

### Requirement: 二重投稿の禁止（Prevent duplicate posts）

x-post-api は、投稿ボタンのクリック後に自動リトライを行ってはならない (SHALL NOT)。`UNKNOWN_STATE` を含む結果不明の応答を受け取ったクライアントは、再投稿してはならない (SHALL NOT)。再実行は人間の判断で行うものとし、エラーメッセージにその旨を明記しなければならない (SHALL)。

#### Scenario: クリック後の自動リトライなし（No automatic retry after click）

- **GIVEN** 投稿ボタンがクリックされた
- **WHEN** 結果の確認がタイムアウトする
- **THEN** 追加のクリックや再投稿は行われず、`UNKNOWN_STATE` が返る

### Requirement: 冪等性（Idempotency）

x-post-api は、任意の `Idempotency-Key` ヘッダーを受け付けなければならない (SHALL)。同一キーの再送に対しては、直前の結果を返し、再投稿してはならない (SHALL NOT)。保持はメモリ上で 15 分とし、再起動で消えることを許容する。

#### Scenario: 同一キーで再送する（Replay with the same key）

- **GIVEN** `Idempotency-Key: abc` で投稿が成功している
- **WHEN** 同じキーで再度 `POST /post` を呼び出す
- **THEN** 再投稿は行われず、直前の成功レスポンスが返る

### Requirement: 排他制御（Serialized posting）

x-post-api は、投稿処理をプロセス内で直列化しなければならない (SHALL)。2 件目以降の投稿は最大 20 秒待ち、待ちきれない場合は 409 `BUSY` を返さなければならない (SHALL)。将来の別プロセスとの同居に備え、ファイルロック（`fcntl`）でも排他できなければならない (SHALL)。

#### Scenario: 同時に 2 件投稿する（Two concurrent posts）

- **GIVEN** 1 件目の投稿が処理中である
- **WHEN** 2 件目の投稿リクエストが届く
- **THEN** 2 件目は最大 20 秒待ち、処理が終わらなければ 409 `BUSY` が返る

### Requirement: レート制限（Rate limiting）

x-post-api は、既定で 10 件/時、最短 10 秒間隔のレート制限を適用しなければならない (SHALL)。超過時は 429 `RATE_LIMITED` と `Retry-After` を返さなければならない (SHALL)。上限と間隔は環境変数で変更できなければならない (SHALL)。

#### Scenario: レート制限を超える（Exceed the rate limit）

- **GIVEN** 直近 1 時間に 10 件の投稿が成功している
- **WHEN** 11 件目の投稿を実行する
- **THEN** 429 `RATE_LIMITED` と `Retry-After` が返り、投稿は行われない

### Requirement: 監査ログ（Audit log）

x-post-api は、1 リクエスト 1 行の JSONL 形式で監査ログを記録しなければならない (SHALL)。記録項目は時刻、リクエスト ID、本文、URL、成否、エラーコード、所要時間としなければならない (SHALL)。トークンや Cookie を記録してはならない (SHALL NOT)。保存先は設定可能でなければならない (SHALL)。

#### Scenario: 投稿結果を記録する（Log the posting result）

- **GIVEN** 投稿リクエストが処理される
- **WHEN** 処理が完了する
- **THEN** 時刻、リクエスト ID、本文、URL、成否、エラーコード、所要時間が JSONL で 1 行記録される
- **AND** `Authorization` ヘッダーの値は記録されない

### Requirement: CORS（Cross-origin resource sharing）

x-post-api は、ブラウザから呼び出せるよう CORS を実装しなければならない (SHALL)。許可する Origin は設定可能とし、`OPTIONS` のプリフライトに 204 で応答しなければならない (SHALL)。`Authorization`、`Content-Type`、`Idempotency-Key` を許可ヘッダーに含めなければならない (SHALL)。

#### Scenario: 許可された Origin からのプリフライト（Allowed origin preflight）

- **GIVEN** `Origin: https://amay077.github.io` が許可されている
- **WHEN** `OPTIONS /post` を呼び出す
- **THEN** 204 と `Access-Control-Allow-Origin: https://amay077.github.io` が返る
- **AND** `Access-Control-Allow-Headers` に `Authorization`、`Content-Type`、`Idempotency-Key` が含まれる

#### Scenario: 許可されていない Origin（Disallowed origin）

- **GIVEN** 許可リストにない Origin が指定されている
- **WHEN** プリフライトを送る
- **THEN** `Access-Control-Allow-Origin` は返らず、ブラウザは実際のリクエストを送信できない

### Requirement: セキュリティ（Security）

x-post-api は `127.0.0.1` などのループバックアドレスにのみ bind しなければならない (SHALL)。リクエストボディの上限を 8KB、リクエストのタイムアウトを 20 秒としなければならない (SHALL)。トークンは 32 バイト以上のランダム値を要求し、ログ・エラーメッセージに含めてはならない (SHALL NOT)。

#### Scenario: 大きなリクエストボディ（Oversized request body）

- **GIVEN** 8KB を超えるリクエストボディが送信される
- **WHEN** `POST /post` を呼び出す
- **THEN** リクエストは拒否され、投稿は行われない

### Requirement: Docker Tailscale デプロイ（Docker Tailscale deployment）

x-post-api は、Tailscale がインストールされていないホスト Mac でも動作するよう、Docker の Tailscale コンテナを入口として提供しなければならない (SHALL)。コンテナは tailnet ノードとして参加し、`tailscale serve` で 443 を `http://host.docker.internal:8788` にプロキシしなければならない (SHALL)。`tailscale funnel` を使用してはならない (SHALL NOT)。state volume を保持し、再起動時に再認証を避けなければならない (SHALL)。

#### Scenario: tailnet 経由で API に到達する（Reach the API over the tailnet）

- **GIVEN** Tailscale コンテナが tailnet に参加し、`tailscale serve` が設定されている
- **WHEN** tailnet 内のクライアントから `https://<host>.<tailnet>.ts.net/health` を呼び出す
- **THEN** TLS 終端されたうえでホストの `127.0.0.1:8788` に到達する

#### Scenario: funnel は使わない（Do not use funnel）

- **GIVEN** Tailscale コンテナが起動している
- **WHEN** 公開設定を確認する
- **THEN** `tailscale funnel` は有効化されておらず、tailnet 内からのみ到達できる

### Requirement: launchd 常駐（launchd service）

x-post-api は、macOS の launchd LaunchAgent で常駐し、異常終了時に自動再起動しなければならない (SHALL)。トークンは plist に直書きせず、パーミッション 600 の env ファイルから読み込まなければならない (SHALL)。

#### Scenario: Mac 再起動後に復帰する（Recover after reboot）

- **GIVEN** LaunchAgent が登録され、`RunAtLoad` と `KeepAlive` が有効である
- **WHEN** ホスト Mac を再起動する
- **THEN** x-post-api が自動的に起動し、`GET /health` に応答する

## Related Changes

- [2026-11-20-PPP-042-add-x-posting](../../changes/archive/2026-11-20-PPP-042-add-x-posting/proposal.md)

