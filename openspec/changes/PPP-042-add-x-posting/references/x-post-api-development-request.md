# 開発依頼書: X 投稿 API（Chrome タブ + Tailscale）

- 版: 1.0
- 作成日: 2026-11-20
- 依頼種別: 新規ツール開発（別リポジトリ）
- 参考実装: `hyde_chats`（Hyde 用ボット。人格・返信機能は流用しない）

---

## 1. 目的

スマートフォンから Tailscale 経由で投稿データを送ると、**macOS 上の Chrome でログイン済みの X アカウント**を使って X に投稿する API を作る。

- 投稿先アカウントは **Hyde（`@carry_hamham`）ではない別アカウント**
- アカウントは設定で差し替え可能にし、コードに固定しない
- API は tailnet 内だけに公開する（インターネットには出さない）

---

## 2. スコープ

### やること

1. macOS ホストで動く HTTP API サーバー
2. Chrome の X タブを AppleScript 経由で操作する投稿処理
3. Docker コンテナ内の Tailscale を入口にした HTTPS 公開
4. launchd による常駐化
5. 認証・入力検証・レート制限・監査ログ
6. 単体テストと受け入れ手順書

### やらないこと

- X の公式 API（OAuth）連携
- 画像・動画・投票・引用・リプライ・DM
- 複数アカウントの同時運用（1プロセス1アカウント）
- Hyde の人格・返信・定期あいさつ機能
- Web UI（スマホはショートカットまたは curl を使う）

---

## 3. 想定利用フロー

```text
[iPhone]
  │ ショートカットで本文を入力
  │ POST https://<host>.<tailnet>.ts.net/post
  ▼
[Tailscale コンテナ]
  │ tailscale serve（TLS終端、tailnet 内のみ）
  │ → http://host.docker.internal:8788
  ▼
[macOS ホスト] x_api.py（127.0.0.1:8788）
  │ 認証 → 検証 → 排他ロック → 投稿
  ▼
Chrome（x.com のタブ、対象アカウントでログイン）
  │ JS で投稿欄に入力 → 投稿ボタンをクリック → 結果確認
  ▼
API が JSON で結果を返す
```

---

## 4. アーキテクチャ

### 4.1 コンポーネント

| コンポーネント | 実行場所 | 役割 |
|---|---|---|
| `x_api.py` | macOS ホスト | HTTP API、認証、検証、投稿の直列化 |
| `chrome_bridge.py` 相当 | macOS ホスト | AppleScript + JS で Chrome を操作 |
| `x-post.js` / `x-check.js` | Chrome 内 | 投稿欄への入力・送信・結果確認 |
| `run-js.applescript` | macOS ホスト | 対象タブの選択と JS 実行 |
| Tailscale コンテナ | Docker | tailnet への参加と HTTPS 終端 |
| launchd LaunchAgent | macOS ホスト | API の常駐・自動再起動 |

### 4.2 ポート・ホスト名（既定案）

| 項目 | 既定値 | 備考 |
|---|---|---|
| API ポート | `8788` | 他ツール（8787 等）と衝突しないよう変更可 |
| API bind | `127.0.0.1` | **`0.0.0.0` にしない** |
| Tailscale ホスト名 | `x-post-api` | URL は `https://x-post-api.<tailnet>.ts.net` |
| 公開ポート | `443`（HTTPS） | `tailscale serve` を使用。funnel は禁止 |

> Docker Desktop の `host.docker.internal` からホストの `127.0.0.1` に到達できることは実機で確認済み（HTTP 200）。この前提が崩れる環境では、bind 先の変更ではなく、まず Docker Desktop の更新・再確認を行うこと。

---

## 5. 機能要件

### FR-1 投稿

- 本文を受け取り、X の投稿欄に入力して投稿する
- 改行は保持する
- 前後の空白は削除する
- 制御文字（`\x00`〜`\x1f` のうち改行・タブ以外）は拒否または除去する
- 空文字・空白のみは拒否する

### FR-2 アカウント固定

- 環境変数 `X_ACCOUNT`（`@` なしハンドル）で投稿先アカウントを指定する
- 複数の X タブがあっても、**サイドバーのアカウント表示が `X_ACCOUNT` と一致するタブだけ**を使う
- 一致するタブがない場合は投稿せず `NO_ACCOUNT` を返す
- アカウント未設定での起動はエラーにする（誤投稿防止）

### FR-3 下書き保護

- 投稿欄に既存テキストがある場合は**絶対に上書きしない**
- `DRAFT_EXISTS` を返し、下書きはそのまま残す

### FR-4 投稿結果の確認

- 投稿ボタンのクリック後、次で成否を判定する
  - 投稿欄が空になった、または
  - トースト（`[data-testid="toast"]`）に送信完了を示す文言が出た
- 判定できない場合は `UNKNOWN_STATE` を返す

### FR-5 二重投稿の禁止（最重要）

- **クリック後の自動リトライを禁止する**
- クライアント・サーバー・監視のいずれの層でも、結果不明時に再投稿しない
- 再実行は人間の判断で行う。その旨をエラーメッセージに明記する

### FR-6 冪等性

- 任意の `Idempotency-Key` ヘッダーを受け付ける
- 同一キーの再送は、直前の結果を返して**再投稿しない**
- 保持はメモリ上で15分。再起動で消えることを許容する

### FR-7 排他制御

- 投稿処理はプロセス内で直列化する
- 2件目以降は最大20秒待つ。待ちきれなければ `BUSY`（409）
- 将来 bot 等と同居する場合に備え、ファイルロック（`fcntl`）でも排他できる設計にする

### FR-8 レート制限

- 既定: 10件/時、最短10秒間隔
- 超過時は `429` と `Retry-After` を返す
- 環境変数で変更可能にする

### FR-9 ヘルスチェック

- API 稼働、Chrome タブの有無、対象アカウントでのログイン、投稿欄の有無を返す
- **投稿は行わない**

### FR-10 監査ログ

- 1リクエスト1行の JSONL
- 記録項目: 時刻、リクエストID、本文、URL、成否、エラーコード、所要時間
- トークン・Cookie は記録しない
- 保存先は設定可能（既定 `logs/x-api.ndjson`）

---

## 6. API 仕様

### 6.1 認証

- 全エンドポイントで `Authorization: Bearer <token>` を必須
- トークンは環境変数 `X_API_TOKEN` から読む
- 比較は `hmac.compare_digest` を使う
- 未設定での起動はエラー

### 6.2 `GET /health`

レスポンス 200:

```json
{
  "ok": true,
  "account": "example_handle",
  "chrome_tab": true,
  "logged_in": true,
  "composer_ready": true,
  "busy": false,
  "last_post_at": "2026-11-20T16:00:00+09:00"
}
```

`composer_ready` は投稿欄の存在確認のみ。下書きの有無は返してよいが、本文は返さない。

### 6.3 `POST /post`

リクエスト:

```json
{
  "text": "投稿する本文",
  "url": "https://example.com/optional",
  "dry_run": false
}
```

| フィールド | 必須 | 仕様 |
|---|---|---|
| `text` | 必須 | 1文字以上。X の重み付き280以内 |
| `url` | 任意 | 指定時は本文の末尾に改行して付加。`http`/`https` のみ許可 |
| `dry_run` | 任意 | `true` なら検証だけ行い、Chrome を操作しない |

成功 200:

```json
{
  "ok": true,
  "posted_at": "2026-11-20T16:00:03+09:00",
  "weighted_length": 72,
  "text": "投稿する本文",
  "url": "https://example.com/optional",
  "request_id": "uuid"
}
```

### 6.4 エラー

| HTTP | error | 意味 |
|---|---|---|
| 400 | `INVALID_JSON` | JSON でない |
| 400 | `EMPTY_TEXT` | 本文が空 |
| 400 | `TOO_LONG` | 重み付き280超 |
| 400 | `INVALID_URL` | URL が http/https でない |
| 401 | `UNAUTHORIZED` | トークン不一致・欠落 |
| 409 | `NO_COMPOSER` | 投稿欄がない（X タブ未読込・未ログイン） |
| 409 | `DRAFT_EXISTS` | 下書きがある |
| 409 | `NO_ACCOUNT` | 対象アカウントのタブがない |
| 409 | `BUSY` | 先行リクエストが処理中 |
| 429 | `RATE_LIMITED` | レート制限 |
| 502 | `POST_FAILED` | ボタン無効・入力失敗など |
| 502 | `UNKNOWN_STATE` | クリック後の確認不能。**再投稿しないこと** |
| 503 | `NO_CHROME_TAB` | Chrome または X タブがない |

エラーレスポンス:

```json
{"ok": false, "error": "NO_ACCOUNT", "message": "対象アカウントの X タブがありません", "request_id": "uuid"}
```

### 6.5 文字数（重み付き）

X の仕様に合わせる。

- URL は 23
- 東アジア文字（ひらがな・カタカナ・漢字・ハングル・全角記号）は 2
- それ以外は 1
- 上限 280

---

## 7. Chrome 操作仕様

### 7.1 前提

- Chrome が起動している
- X に対象アカウントでログインしている
- `https://x.com/home` を開いたタブがある（ピン留め推奨）
- Chrome の「表示 > デベロッパー > Apple Events からの JavaScript を許可」が ON
- macOS の自動化許可（osascript → Google Chrome）が済んでいる

### 7.2 タブ選択（AppleScript）

1. 全ウィンドウ・全タブを走査
2. URL に `x.com/` を含むタブを候補にする
3. 各候補で次を実行し、小文字化した文字列に `X_ACCOUNT` が含まれるか確認

```js
(() => {
  const b = document.querySelector('[data-testid=SideNav_AccountSwitcher_Button]');
  return b ? (b.innerText || '').toLowerCase() : '';
})()
```

4. 一致したタブで JS を実行
5. 一致なしは `NO_ACCOUNT`、候補なしは `NO_TAB` を返す

### 7.3 セレクタ

| 要素 | セレクタ |
|---|---|
| 投稿欄 | `div[data-testid="tweetTextarea_0"]` |
| 投稿ボタン（ホーム） | `button[data-testid="tweetButtonInline"]` |
| 投稿ボタン（モーダル） | `button[data-testid="tweetButton"]` |
| アカウント表示 | `[data-testid="SideNav_AccountSwitcher_Button"]` |
| トースト | `[data-testid="toast"]` |

セレクタは1箇所に定数化し、変更時に差し替えやすくする。

### 7.4 投稿手順

```text
1. 対象タブを特定（アカウント照合）
2. 投稿欄の存在確認 → なければ NO_COMPOSER
3. 投稿欄が空か確認 → 空でなければ DRAFT_EXISTS
4. focus → selectAll → delete → insertText(本文)
5. innerText が本文と一致するか確認 → 不一致なら入力を消して POST_FAILED
6. 約800ms待ち、投稿ボタンが存在し有効か確認
7. ボタンを1回だけ click
8. 約3秒待ち、投稿欄が空 or トーストを確認
9. 成功なら 200、確認不能なら UNKNOWN_STATE（再試行しない）
```

### 7.5 参考実装

`hyde_chats` の以下を参考にしてよい（コピー可、ただし人格・返信処理は持ち込まない）。

- `run-js.applescript`
- `x-post.js`
- `x-check.js`
- `reply-bot.py` の `post_to_x` / `normalize_live_url`

---

## 8. Tailscale（Docker）仕様

### 8.1 前提

- 対象 Mac は tailnet に未参加でもよい（コンテナだけ参加させる）
- Tailscale 管理画面で **MagicDNS** と **HTTPS Certificates** を有効にする
- Auth Key は Reusable / Ephemeral false / Pre-authorized で発行
- 可能ならタグ `tag:x-post-api` を付与

### 8.2 構成

```text
x-api/
  docker-compose.yml
  serve.json
  .env.example
```

`docker-compose.yml`（例）:

```yaml
services:
  tailscale:
    image: tailscale/tailscale:latest
    container_name: x-post-api-ts
    hostname: x-post-api
    restart: unless-stopped
    environment:
      TS_AUTHKEY: ${TS_AUTHKEY}
      TS_STATE_DIR: /var/lib/tailscale
      TS_USERSPACE: "true"
      TS_SERVE_CONFIG: /config/serve.json
    volumes:
      - ts-state:/var/lib/tailscale
      - ./serve.json:/config/serve.json:ro
volumes:
  ts-state:
```

`serve.json`（例）:

```json
{
  "TCP": {
    "443": { "HTTPS": true }
  },
  "Web": {
    "${TS_CERT_DOMAIN}:443": {
      "Handlers": {
        "/": { "Proxy": "http://host.docker.internal:8788" }
      }
    }
  }
}
```

### 8.3 注意

- `tailscale funnel` は使わない（インターネット公開になる）
- state volume を消すと再認証が必要になる
- `host.docker.internal` からホストの `127.0.0.1` に到達できることを、構築後に必ず再確認する

---

## 9. 常駐化（launchd）

- `~/Library/LaunchAgents/com.<org>.xpostapi.plist`
- `RunAtLoad` / `KeepAlive` を有効化
- 作業ディレクトリをプロジェクトルートにする
- トークンは plist に直書きせず、パーミッション 600 の env ファイルをラッパーで読み込む
- 標準出力・標準エラーを `logs/` に出す

再起動確認:

```bash
launchctl unload ~/Library/LaunchAgents/com.<org>.xpostapi.plist
launchctl load  ~/Library/LaunchAgents/com.<org>.xpostapi.plist
```

---

## 10. セキュリティ要件

- API は `127.0.0.1` のみ bind（LAN・インターネット非公開）
- tailnet 内でもトークン必須
- トークンは 32 バイト以上のランダム値
- ログ・エラーメッセージにトークンを含めない
- リクエストボディ上限 8KB
- タイムアウト 20 秒
- Tailscale ACL で利用端末を限定する（可能なら）
- `.env` と state volume を git 管理しない

---

## 11. テスト要件

### 11.1 単体テスト（外部通信なし）

- 重み付き文字数（日本語・英語・URL・混在）
- 認証（正/誤/欠落）
- 入力検証（空、制御文字、URL スキーム、長さ）
- 冪等性（同一キーの再送で1回だけ）
- レート制限
- 排他制御（同時2件で片方が BUSY）
- **クリック後の自動リトライが発生しないこと**

### 11.2 結合テスト（Chrome をモック）

- `NO_COMPOSER` / `DRAFT_EXISTS` / `NO_ACCOUNT` / `BUTTON_DISABLED` の分岐
- `UNKNOWN_STATE` のとき再投稿しないこと

### 11.3 手動 E2E（実機）

1. `GET /health` が対象アカウントで `ok: true`
2. `POST /post` で1件だけ投稿される
3. 同じ `Idempotency-Key` で再送しても増えない
4. 誤トークンで 401、投稿されない
5. 別アカウントのタブだけにして `NO_ACCOUNT`
6. 下書きを置いて `DRAFT_EXISTS`、下書きが残る
7. スマホ（Tailscale 経由）から投稿できる
8. LAN から `http://<MacのIP>:8788` に接続できない

---

## 12. 受け入れ基準

- [ ] スマホから tailnet 経由で投稿できる
- [ ] 投稿先が設定したアカウントと一致する
- [ ] 別アカウントのタブがあっても誤投稿しない
- [ ] 下書きを消さない
- [ ] 結果不明時に二重投稿しない
- [ ] 誤トークンでは投稿されない
- [ ] LAN・インターネットから API に到達できない
- [ ] Mac 再起動後に API が自動で復帰する
- [ ] Docker 再起動後も Tailscale が再認証なしで復帰する
- [ ] 監査ログに成否が残る
- [ ] README の手順だけで第三者が再構築できる

---

## 13. 既知の制約

- Chrome の UI 変更・ログアウト・タブ閉鎖で投稿できなくなる
- Mac のスリープ中は応答しない
- macOS の自動化許可が必要
- X のブラウザ自動化は公式 API より制限・ロックのリスクがある
- 応答時間は約4〜6秒（クリックと確認を含む）
- Docker Desktop 4.3.2 は古い。動作確認はできるが、更新を推奨
- `host.docker.internal` からホスト loopback への到達性は環境依存。構築時に必ず再確認する

---

## 14. 成果物

```text
x-post-api/
  README.md                 # セットアップ・運用手順
  x_api.py                  # API サーバー
  chrome_bridge.py          # AppleScript/JS 連携
  run-js.applescript
  x-post.js
  x-check.js
  tests/                    # 単体・結合テスト
  x-api/docker-compose.yml
  x-api/serve.json
  x-api/.env.example
  launchd/com.example.xpostapi.plist.example
  logs/                     # git 管理外
  .gitignore
```

---

## 15. 未決事項（依頼者に確認）

1. 投稿先アカウントのハンドル（`X_ACCOUNT`）
2. Tailscale のホスト名（既定 `x-post-api`）
3. API ポート（既定 `8788`）
4. 本文の制限（`@` や URL を拒否するか）
5. レート制限の値（既定 10件/時、最短10秒）
6. テスト投稿を実際のアカウントで行ってよいか
7. Docker Desktop を更新してよいか
8. Mac をスリープさせない運用にしてよいか
