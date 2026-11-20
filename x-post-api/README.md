# x-post-api

macOS 上の Google Chrome にログイン済みの X アカウントを操作して、テキストを投稿するローカル API です。X の公式 API は使いません。ホスト Mac に Tailscale をインストールせず、Docker の Tailscale コンテナを tailnet の入口として公開します。

別の Mac へ ZIP で配布する手順は [DEPLOY_OTHER_MAC.md](DEPLOY_OTHER_MAC.md) を参照してください。

## 構成

```text
[スマホ (Tailscale 参加)]
  │ https://x-post-api.<tailnet>.ts.net/post
  ▼
[ホスト Mac: Docker Desktop]
  └ Tailscale コンテナ (tailnet ノード: x-post-api)
       └ tailscale serve (443, TLS 終端)
            └ http://host.docker.internal:8788
                 ▼
[ホスト Mac: 127.0.0.1:8788]
  └ x_api.py (launchd で常駐)
       └ osascript → Google Chrome (X ログイン済み)
```

- ホスト Mac 自身は tailnet に参加しません。
- tailnet ノードになるのは Docker コンテナだけです。
- API は `127.0.0.1:8788` にのみ bind します。
- `tailscale funnel` は使いません。

## 必要なもの

### ホスト Mac

- macOS
- Google Chrome（対象アカウントで X にログイン）
- Python 3.9 以上（macOS 標準の `/usr/bin/python3` で可）
- Docker Desktop（「サインイン時に Docker Desktop を起動」を ON）
- インターネット接続（Tailscale の認証と X への接続）

### Tailscale 管理画面

- MagicDNS を有効にする
- HTTPS Certificates を有効にする
- Auth Key を発行する
  - Reusable: 有効
  - Ephemeral: 無効
  - Pre-authorized: 有効
  - 可能ならタグ `tag:x-post-api` を付与
- クライアント（スマホ）が tailnet に参加していること
- 必要に応じて ACL で利用端末を限定する

## セットアップ

### 1. リポジトリを取得する

ホスト Mac で本リポジトリを clone します。

```bash
git clone https://github.com/amay077/pppost.git
cd pppost/x-post-api
```

### 2. Python を確認する

```bash
/usr/bin/python3 --version
```

3.9 以上であれば追加のインストールは不要です。別の Python を使う場合は `.env` の `X_API_PYTHON` に絶対パスを設定してください。

### 3. `.env` を作成する

```bash
cp .env.example .env
chmod 600 .env
```

`.env` を編集します。

- `X_API_TOKEN`: `openssl rand -hex 32` で生成した値
- `X_ACCOUNT`: 投稿先の X ハンドル（`@` なし）。Hyde を含む任意のアカウントを指定でき、特定のアカウントに固定されない
- `TS_AUTHKEY`: Tailscale で発行した Auth Key
- 必要に応じて `X_API_ALLOWED_ORIGINS` を変更する

`X_API_TOKEN` は PPPOST の X 接続設定にも入力します。他人に渡さないでください。

### 4. Tailscale コンテナを起動する

```bash
docker compose up -d
docker compose logs -f tailscale
```

ログに `Success.` が出るまで待ちます。`Ctrl+C` でログ表示だけ終了します。

状態を確認します。

```bash
docker compose exec tailscale tailscale status
docker compose exec tailscale tailscale serve status
```

`tailscale serve status` に `https://x-post-api.<tailnet>.ts.net` が表示されれば成功です。

### 5. API を起動する

```bash
cp launchd/run.sh.example launchd/run.sh
chmod +x launchd/run.sh
./launchd/run.sh
```

別のターミナルで確認します。

```bash
source .env
curl -sS -H "Authorization: Bearer $X_API_TOKEN" http://127.0.0.1:8788/health
```

Chrome の設定がまだの場合は `ok: false` になります。API 自体は起動しているため、手順 7 の後に再度確認してください。

### 6. `host.docker.internal` の到達性を確認する

```bash
source .env
docker compose exec tailscale wget -qO- \
  --header="Authorization: Bearer $X_API_TOKEN" \
  http://host.docker.internal:8788/health
```

`/health` の JSON が返れば到達できています。401 が返る場合は API には届いていますがトークンが違います。接続できない場合は Docker Desktop を更新し、API が `127.0.0.1:8788` で起動していることを確認してください。

### 7. Chrome を設定する

1. 対象アカウントで X にログインする
2. `https://x.com/home` を開き、タブをピン留めする
3. Chrome のメニューで「表示 > デベロッパー > Apple Events からの JavaScript を許可」を ON にする
4. 初回の `osascript` 実行時に macOS の自動化許可を求められたら許可する

「システム設定 > プライバシーとセキュリティ > オートメーション」で、ターミナルまたは launchd から Google Chrome を操作できることを確認してください。

設定後に再度 `/health` を確認し、`ok: true` になることを確認します。

```bash
source .env
curl -sS -H "Authorization: Bearer $X_API_TOKEN" http://127.0.0.1:8788/health
```

### 8. launchd に登録する

```bash
mkdir -p logs
cp launchd/com.example.xpostapi.plist.example \
  ~/Library/LaunchAgents/com.example.xpostapi.plist
```

plist 内の `/path/to/pppost` を実際のパスに置き換えます。`ProgramArguments` は `launchd/run.sh` を指します。手動で起動した API が残っている場合は、先に `Ctrl+C` で停止してください。

```bash
launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/com.example.xpostapi.plist
launchctl print gui/$(id -u)/com.example.xpostapi
```

再起動する場合:

```bash
launchctl kickstart -k gui/$(id -u)/com.example.xpostapi
```

停止する場合:

```bash
launchctl bootout gui/$(id -u)/com.example.xpostapi
```

従来の `launchctl load` / `launchctl unload` でも動作します。

### 9. スマホから確認する

スマホの Tailscale を ON にし、tailnet の DNS 名で確認します。

```bash
curl -sS -H "Authorization: Bearer <X_API_TOKEN>" \
  https://x-post-api.<tailnet>.ts.net/health
```

### 10. PPPOST に接続する

1. スマホで PPPOST を開く（Tailscale を ON）
2. X の接続設定を開く
3. ベース URL に `https://x-post-api.<tailnet>.ts.net` を入力する
4. API トークンに `X_API_TOKEN` を入力する
5. 「接続テスト」を実行する
6. 対象アカウントと投稿欄の状態が表示されたら接続完了

## API

### `GET /health`

```bash
curl -sS -H "Authorization: Bearer $X_API_TOKEN" \
  http://127.0.0.1:8788/health
```

```json
{
  "ok": true,
  "account": "example_handle",
  "chrome_tab": true,
  "logged_in": true,
  "composer_ready": true,
  "draft_exists": false,
  "busy": false,
  "last_post_at": "2026-11-20T16:00:00+09:00"
}
```

- `ok` は Chrome タブ・ログイン・投稿欄のすべてが揃っている場合に `true`
- `draft_exists` は下書きの有無のみを返し、本文は返しません
- このエンドポイントは投稿を行いません

### `POST /post`

```bash
curl -sS -X POST http://127.0.0.1:8788/post \
  -H "Authorization: Bearer $X_API_TOKEN" \
  -H "Content-Type: application/json" \
  -H "Idempotency-Key: $(uuidgen)" \
  -d '{"text": "投稿する本文"}'
```

```json
{
  "ok": true,
  "posted_at": "2026-11-20T16:00:03+09:00",
  "weighted_length": 12,
  "text": "投稿する本文",
  "url": "",
  "request_id": "uuid"
}
```

- `url` を指定すると、本文の末尾に改行して付加されます
- `dry_run: true` を指定すると検証だけ行い、Chrome を操作しません
- `Idempotency-Key` を付けると、同じキーの再送で再投稿しません（メモリ上に 15 分保持）

### エラー

| HTTP | error | 意味 |
|---|---|---|
| 400 | `INVALID_JSON` | JSON として解釈できない |
| 400 | `EMPTY_TEXT` | 本文が空 |
| 400 | `INVALID_TEXT` | 改行・タブ以外の制御文字を含む |
| 400 | `TOO_LONG` | 重み付き 280 超 |
| 400 | `INVALID_URL` | URL が http/https でない、または空白を含む |
| 401 | `UNAUTHORIZED` | トークン不一致・欠落 |
| 404 | `NOT_FOUND` | パスが存在しない |
| 405 | `METHOD_NOT_ALLOWED` | メソッドが異なる |
| 408 | `TIMEOUT` | リクエストがタイムアウト |
| 409 | `NO_COMPOSER` | 投稿欄がない |
| 409 | `DRAFT_EXISTS` | 下書きがある |
| 409 | `NO_ACCOUNT` | 対象アカウントのタブがない |
| 409 | `BUSY` | 先行リクエストが処理中 |
| 413 | `PAYLOAD_TOO_LARGE` | リクエストボディが 8KB 超 |
| 429 | `RATE_LIMITED` | レート制限。`Retry-After` 付き |
| 502 | `POST_FAILED` | ボタン無効・入力失敗など |
| 502 | `UNKNOWN_STATE` | クリック後の確認不能。再投稿しないこと |
| 503 | `NO_CHROME_TAB` | Chrome または X タブがない |
| 503 | `CHROME_PERMISSION` | Chrome の Apple Events 設定または macOS の自動化許可がない |
| 500 | `INTERNAL_ERROR` | 内部エラー |

エラーレスポンス:

```json
{
  "ok": false,
  "error": "NO_ACCOUNT",
  "message": "対象アカウント @example_handle の X タブがありません",
  "request_id": "uuid"
}
```

## 文字数

X の重み付き文字数に合わせます。

- URL は 23
- 東アジア文字（ひらがな・カタカナ・漢字・ハングル・全角記号）は 2
- それ以外は 1
- 上限は 280

## セキュリティ

- API は `127.0.0.1` にのみ bind します。`0.0.0.0` は起動時に拒否します。
- Tailscale コンテナは tailnet 内にのみ公開します。`tailscale funnel` は使わないでください。
- API トークンは 32 バイト以上の ASCII ランダム値にしてください。
- `.env` は `chmod 600` にし、git にコミットしないでください。
- 監査ログには投稿本文が含まれます。ログファイルのアクセス権に注意してください。
- ブラウザの `localStorage` に API トークンが保存されます。端末の共有や XSS に注意してください。
- Chrome のプロファイルには X のログイン情報が含まれます。ホスト Mac のユーザーアカウントを保護してください。
- トークンが漏洩した可能性がある場合は、`.env` の `X_API_TOKEN` を変更し、PPPOST の接続設定も更新してください。

## 監査ログ

既定では `logs/x-api.ndjson` に 1 リクエスト 1 行の JSONL で記録します。

```json
{"ts":"2026-11-20T16:00:03+09:00","request_id":"uuid","method":"POST","path":"/post","text":"投稿する本文","url":null,"ok":true,"error":null,"duration_ms":4210,"idempotent":false}
```

- `Authorization` ヘッダーや Cookie は記録しません。
- ログの保存先は `X_API_LOG_PATH` で変更できます。

## テスト

Chrome やネットワークを使わない単体テストです。

```bash
cd x-post-api
python3 -m unittest discover -s tests -t . -v
/usr/bin/python3 -m unittest discover -s tests -t . -v
```

## 運用

### 状態確認

```bash
launchctl print gui/$(id -u)/com.example.xpostapi
tail -f logs/launchd.err.log
tail -f logs/x-api.ndjson
docker compose ps
docker compose exec tailscale tailscale status
```

### 更新

```bash
git pull
launchctl kickstart -k gui/$(id -u)/com.example.xpostapi
docker compose up -d
```

### Mac 再起動後

- launchd が API を起動します。
- Docker Desktop が起動し、`restart: unless-stopped` の Tailscale コンテナが復帰します。
- Tailscale の state volume が残っていれば再認証は不要です。
- Chrome は自動起動しません。ログイン時に Chrome を開くか、手動で起動してください。

## トラブルシューティング

### `NO_CHROME_TAB`

- Chrome が起動しているか確認する
- `https://x.com/home` のタブがあるか確認する
- タブが読み込み中でないか確認する

### `NO_ACCOUNT`

- `X_ACCOUNT` のハンドルが正しいか確認する
- Chrome のサイドバーに `@<X_ACCOUNT>` が表示されているか確認する
- 別アカウントのタブだけになっていないか確認する

### `NO_COMPOSER`

- 対象タブが `https://x.com/home` を開いているか確認する
- X の UI が変わっていないか確認する

### `DRAFT_EXISTS`

- X の投稿欄に下書きが残っています。下書きを消してから再実行してください。
- 下書きは API が削除しません。

### `CHROME_PERMISSION`

- Chrome の「表示 > デベロッパー > Apple Events からの JavaScript を許可」を ON にする
- システム設定 > プライバシーとセキュリティ > オートメーション で許可する
- 設定変更後、Chrome と API を再起動する

### `UNKNOWN_STATE`

- クリック後の結果を確認できませんでした。
- **再投稿しないでください**。X を開いて投稿済みか確認してください。
- 投稿済みでない場合だけ、人間の判断で再実行してください。

### `BUSY`

- 先行の投稿処理中です。20 秒ほど待ってから再実行してください。

### `RATE_LIMITED`

- 既定では 10 件/時、最短 10 秒間隔です。
- `Retry-After` の秒数だけ待ってから再実行してください。

### `host.docker.internal` に到達できない

- Docker Desktop を最新版に更新する
- API が起動しているか確認する
- `X_API_BIND` が `127.0.0.1` になっているか確認する
- Docker Desktop の「サインイン時に起動」を ON にする

### tailnet から到達できない

- Tailscale 管理画面で MagicDNS と HTTPS Certificates が有効か確認する
- `docker compose exec tailscale tailscale status` でコンテナが参加しているか確認する
- `docker compose exec tailscale tailscale serve status` で 443 の設定を確認する
- スマホの Tailscale が ON か確認する
- ACL で利用端末が許可されているか確認する

### 投稿できない（Chrome の UI 変更）

- `x-check.js` / `x-post.js` のセレクタを確認する
- X の UI が変わった場合は、セレクタを更新してテストする

## 受け入れチェック

- [ ] スマホから tailnet 経由で `/health` に到達できる
- [ ] スマホから tailnet 経由で 1 件だけ投稿できる
- [ ] 投稿先が `X_ACCOUNT` と一致する
- [ ] 別アカウントのタブがあっても誤投稿しない
- [ ] 下書きを消さない
- [ ] 結果不明時に二重投稿しない
- [ ] 誤トークンでは投稿されない
- [ ] LAN・インターネットから API に直接到達できない
- [ ] Mac 再起動後に API と Tailscale が自動で復帰する
- [ ] 監査ログに成否が残る
- [ ] README の手順だけで第三者が再構築できる

## 制限事項

- テキスト投稿のみ（画像・動画・リプライ・引用は非対応）
- Mac のスリープ中は応答しない
- Chrome の UI 変更・ログアウト・タブ閉鎖で投稿できなくなる
- macOS の自動化許可と Chrome の Apple Events 設定が必要
- X のブラウザ自動化は公式 API より制限・ロックのリスクがある
- X の投稿一覧を取得しないため、PPPOST のリプライ/引用候補には表示されない
