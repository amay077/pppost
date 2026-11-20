# 別の Mac へ配布して Docker で動かす手順

この手順は、開発機とは別の Mac（以下「ホスト Mac」）で `x-post-api` を動かし、tailnet 経由でクライアント（この Mac）から使うためのものです。

## 構成

```text
[クライアント: この Mac (Tailscale 参加)]
  │ https://x-post-api.tail900c4a.ts.net
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

- ホスト Mac に Tailscale をインストールする必要はありません。Docker コンテナだけが tailnet に参加します。
- クライアント（この Mac）は tailnet に参加済みです。
- tailnet のサフィックスは、この Mac の `tailscale status` では `tail900c4a.ts.net` です。
- ホスト Mac のノード名は `x-post-api`、URL は `https://x-post-api.tail900c4a.ts.net` です。
- 投稿に使う Chrome はホスト Mac の Chrome です。クライアントの Chrome は使いません。

## ZIP に含まれるもの

```text
pppost-x-post-api-deploy-20261120/
└── x-post-api/
    ├── DEPLOY_OTHER_MAC.md   ← この手順書
    ├── README.md
    ├── x_api.py
    ├── chrome_bridge.py
    ├── run-js.applescript
    ├── x-post.js
    ├── x-check.js
    ├── tests/
    ├── docker-compose.yml
    ├── serve.json
    ├── .env.example
    └── launchd/
        ├── com.example.xpostapi.plist.example
        └── run.sh.example
```

`.env`、ログ、`__pycache__`、API トークンは含まれていません。ホスト Mac で作成します。

## ホスト Mac の前提

- macOS
- Google Chrome（投稿先アカウントで X にログイン）
- Python 3.9 以上（`/usr/bin/python3 --version` で確認）
- Docker Desktop（最新版を推奨。「サインイン時に Docker Desktop を起動」を ON）
- インターネット接続
- Tailscale 管理画面へアクセスできること

## 1. ZIP をホスト Mac へコピーして展開する

ZIP をホスト Mac の任意の場所（例: `~/pppost-x-post-api-deploy-20261120`）へコピーして展開します。

```bash
cd ~
mkdir -p pppost-x-post-api-deploy-20261120
unzip pppost-x-post-api-deploy-20261120.zip -d pppost-x-post-api-deploy-20261120
cd pppost-x-post-api-deploy-20261120/x-post-api
```

## 2. Tailscale の Auth Key を発行する

Tailscale 管理画面で以下を有効にします。

- MagicDNS
- HTTPS Certificates

Auth Key を発行します。

- Reusable: 有効
- Ephemeral: 無効
- Pre-authorized: 有効
- 可能ならタグ `tag:x-post-api` を付与

Auth Key はホスト Mac の `.env` にだけ保存し、共有しないでください。

## 3. `.env` を作成する

```bash
cp .env.example .env
chmod 600 .env
```

`.env` を編集します。

```bash
# 32 バイト以上の ASCII ランダム値
openssl rand -hex 32
```

- `X_API_TOKEN`: 上で生成した値。PPPOST の X 接続設定にも同じ値を入力する
- `X_ACCOUNT`: 投稿先の X ハンドル（`@` なし）。Hyde を含む任意のアカウントを指定できる
- `TS_AUTHKEY`: Tailscale で発行した Auth Key
- `X_API_ALLOWED_ORIGINS`: 既定値のままでよい。クライアントの PPPOST が GitHub Pages 以外なら追加する
- `X_API_PYTHON`: 既定の `/usr/bin/python3` でよい

`.env` は git にコミットしないでください。

## 4. Docker の Tailscale コンテナを起動する

Docker Desktop を起動してから実行します。

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

期待する結果:

- `tailscale status` に `x-post-api` ノードが見える
- `tailscale serve status` に `https://x-post-api.tail900c4a.ts.net` が見える

`tailscale funnel` は使わないでください。tailnet 内だけに公開します。

## 5. API を手動で起動する

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

Chrome の設定前は `ok: false`（`NO_CHROME_TAB`）になります。API 自体は起動しています。

## 6. ホスト Mac の Chrome を設定する

1. 投稿先アカウントで X にログインする
2. `https://x.com/home` を開き、タブをピン留めする
3. Chrome のメニューで「表示 > デベロッパー > Apple Events からの JavaScript を許可」を ON にする
4. 初回の `osascript` 実行時に macOS の自動化許可を求められたら許可する
5. システム設定 > プライバシーとセキュリティ > オートメーション で、ターミナルまたは launchd から Google Chrome を操作できることを確認する

再度 `/health` を確認します。

```bash
source .env
curl -sS -H "Authorization: Bearer $X_API_TOKEN" http://127.0.0.1:8788/health
```

`ok: true` になれば、Chrome と対象アカウントの準備ができています。

## 7. `host.docker.internal` の到達性を確認する

```bash
source .env
docker compose exec tailscale wget -qO- \
  --header="Authorization: Bearer $X_API_TOKEN" \
  http://host.docker.internal:8788/health
```

`ok: true` の JSON が返れば、コンテナからホストの API に到達できています。

`NO_CHROME_TAB` が返る場合は、API には到達していますが Chrome の準備ができていません。手順 6 を確認してください。

接続できない場合は、Docker Desktop を最新版に更新し、API が `127.0.0.1:8788` で起動していることを確認してください。

## 8. launchd に登録する

手動で起動した API を `Ctrl+C` で停止してから実行します。

```bash
mkdir -p logs
cp launchd/com.example.xpostapi.plist.example \
  ~/Library/LaunchAgents/com.example.xpostapi.plist
```

plist 内の `/path/to/pppost` を実際のパスに置き換えます。`ProgramArguments` は `launchd/run.sh` を指します。

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

## 9. クライアント（この Mac）から確認する

この Mac の Tailscale を ON にします。

```bash
tailscale status
```

`x-post-api` ノードが見えることを確認します。

```bash
curl -sS -H "Authorization: Bearer <X_API_TOKEN>" \
  https://x-post-api.tail900c4a.ts.net/health
```

`ok: true` が返れば、tailnet 経由の疎通は完了です。

## 10. PPPOST の X 接続を設定する

1. この Mac で PPPOST を開く
2. X の接続設定を開く
3. ベース URL に `https://x-post-api.tail900c4a.ts.net` を入力する
4. API トークンに `X_API_TOKEN` と同じ値を入力する
5. 「接続テスト」を実行する
6. `ok: true` と対象アカウントが表示されたら接続完了

この時点ではまだ投稿しないでください。まず `/health` と接続テストだけ確認します。

## 11. 受け入れチェック

- [ ] クライアントから `https://x-post-api.tail900c4a.ts.net/health` が `ok: true`
- [ ] 投稿先が `X_ACCOUNT` と一致する
- [ ] 別アカウントのタブがあっても誤投稿しない
- [ ] 下書きを消さない
- [ ] 結果不明時に二重投稿しない
- [ ] 誤トークンでは投稿されない
- [ ] LAN・インターネットから API に直接到達できない
- [ ] Mac 再起動後に API と Tailscale コンテナが自動で復帰する
- [ ] 監査ログに成否が残る
- [ ] PPPOST の X 接続テストが成功する

## トラブルシューティング

### `NO_CHROME_TAB`

- ホスト Mac の Chrome が起動しているか確認する
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

- X の投稿欄に下書きが残っています。下書きを消してから再実行してください
- 下書きは API が削除しません

### `CHROME_PERMISSION`

- Chrome の「表示 > デベロッパー > Apple Events からの JavaScript を許可」を ON にする
- システム設定 > プライバシーとセキュリティ > オートメーション で許可する
- 設定変更後、Chrome と API を再起動する

### `UNKNOWN_STATE`

- クリック後の結果を確認できませんでした
- **再投稿しないでください**。X を開いて投稿済みか確認してください
- 投稿済みでない場合だけ、人間の判断で再実行してください

### `BUSY`

- 先行の投稿処理中です。20 秒ほど待ってから再実行してください

### `RATE_LIMITED`

- 既定では 10 件/時、最短 10 秒間隔です
- `Retry-After` の秒数だけ待ってから再実行してください

### `host.docker.internal` に到達できない

- Docker Desktop を最新版に更新する
- API が `127.0.0.1:8788` で起動しているか確認する
- Docker Desktop の「サインイン時に起動」を ON にする

### tailnet から到達できない

- Tailscale 管理画面で MagicDNS と HTTPS Certificates が有効か確認する
- `docker compose exec tailscale tailscale status` で `x-post-api` ノードを確認する
- `docker compose exec tailscale tailscale serve status` で 443 の設定を確認する
- クライアントの Tailscale が ON か確認する
- ACL で利用端末が許可されているか確認する

### Docker コンテナが再認証を求める

- `x-post-api/ts-state` の volume を削除していないか確認する
- volume を削除した場合は、新しい Auth Key で再認証する

## セキュリティ

- `.env` は `chmod 600` にし、git にコミットしない
- API トークンは 32 バイト以上の ASCII ランダム値にする
- API は `127.0.0.1` にのみ bind する
- `tailscale funnel` は使わない
- 監査ログには投稿本文が含まれるため、ログのアクセス権に注意する
- ホスト Mac の Chrome プロファイルには X のログイン情報が含まれる
- トークンが漏洩した可能性がある場合は、`.env` の `X_API_TOKEN` を変更し、PPPOST の接続設定も更新する

## 注意事項

- 投稿に使う Chrome はホスト Mac の Chrome です。クライアントの Chrome は使いません
- ホスト Mac の `X_ACCOUNT` と Chrome のログインアカウントを一致させてください
- ホスト Mac をスリープさせない運用にしてください
- Chrome の UI 変更でセレクタが壊れることがあります
- X のブラウザ自動化は公式 API より制限・ロックのリスクがあります
- X の投稿一覧は取得しないため、PPPOST のリプライ/引用候補には表示されません
