# Design: X 投稿対応

## Context

- 旧 Twitter 連携は公式 API の課金・制限により廃止済み。
- 新方式は、macOS 上の Chrome にログイン済みの X アカウントを AppleScript + JS で操作する。
- ホストは開発機とは別の Mac で、Tailscale がインストールされていない。
- クライアント（スマホ）は Tailscale に参加している。
- PPPOST のバックエンドは Netlify（インターネット上）のため、tailnet 内の API に到達できない。
- 今回のスコープはテキスト投稿のみ。画像・動画・リプライ・引用は将来の拡張とする。

## Goals / Non-Goals

- Goals:
  - PPPOST から X へテキスト投稿できる
  - 追加の API 課金なしで運用できる
  - 二重投稿を防止する
  - ホスト Mac の Chrome と tailnet を安全に使う
  - 単体テストと受け入れ手順を提供する
- Non-Goals:
  - 画像・動画・リプライ・引用・投票・DM
  - X 公式 API 連携
  - 複数アカウントの同時運用
  - X の投稿一覧取得

## Decisions

### D1: クライアントから x-post-api を直接呼ぶ

Netlify Functions は tailnet に到達できないため、ブラウザから `https://<tailnet ホスト>/post` を直接呼ぶ。CORS は x-post-api 側で許可する。X の API トークンはブラウザの `localStorage` に保存する。tailnet 内でしか使えないため、リスクは限定される。

### D2: Docker の Tailscale コンテナを入口にする

ホスト Mac に Tailscale を入れない。`tailscale/tailscale` コンテナが tailnet ノード `x-post-api` になる。`tailscale serve` で 443 → `http://host.docker.internal:8788` にプロキシする。`tailscale funnel` は使わない。state volume を保持し、再起動で再認証を避ける。

### D3: Python 3.9+ の標準ライブラリのみ

`http.server.ThreadingHTTPServer` と `BaseHTTPRequestHandler` を使う。追加の実行時依存を持たない。launchd と相性がよい。テストは `unittest` とモックで行う。

### D4: AppleScript + 同期 JS

Chrome の `execute javascript` は Promise を待てないため、JS は同期処理にする。入力（fill）→ 800ms 待ち → ボタン確認 → クリック（click）→ 3 秒待ち → 確認、の順に分ける。クリックは 1 回だけ。クリック後の自動リトライはしない。

### D5: 冪等性と排他

`Idempotency-Key` をメモリに 15 分保持し、再送は直前の結果を返す。投稿処理はプロセス内ロックで直列化し、2 件目は最大 20 秒待つ。ファイルロック（`fcntl`）でも排他できるようにする。

### D6: テキストのみ

画像・動画・リプライ・引用は X の対象外。PPPOST 側で非対応要素がある場合は X を選択不可にする。API も非対応の入力を受け付けない。

### D7: 投稿先アカウントは X_ACCOUNT で差し替える

特定のアカウント（Hyde を含む）に固定しない。`X_ACCOUNT` と一致するタブだけを使用し、Hyde を指定することも、別アカウントを指定することもできる。

## Risks / Trade-offs

- X の UI 変更でセレクタが壊れる → セレクタを 1 箇所に定数化し、手動 E2E を受け入れ手順に含める。
- Chrome の権限（Apple Events / 自動化）が不足する → README に設定手順とエラー表示を追加する。
- `host.docker.internal` の到達性は Docker Desktop に依存する → 構築時に確認し、必要なら更新する。
- Mac のスリープ中は応答しない → スリープを無効化する運用を README に記載する。
- X の投稿トークンを localStorage に保存する → tailnet 限定トークンとし、README にリスクを記載する。
- 投稿履歴を取得できない → リプライ/引用の候補に出せないことを仕様に明記する。

## Migration Plan

- 既存の投稿対象には影響しない。
- X を使わないユーザーは設定しない限りチェックボックスが無効のまま。
- 旧 Twitter の `ppp_setting_twitter` は参照しない。

## Open Questions

- なし（今回のスコープはテキスト投稿のみ）。
