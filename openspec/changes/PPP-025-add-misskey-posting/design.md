# 技術設計

## Context

Misskey は Mastodon とは別系統の API を持つ分散型 SNS である。本アプリは既に Mastodon・Bluesky・Threads の 3 種を扱っており、いずれも「フロントの接続 UI + `{sns}_token` / `{sns}_post` / `{sns}_posts` の 3 バックエンド関数 + `credential-custody` によるサーバー側トークン保管」という同じ骨格で実装されている。Misskey もこの骨格に乗せる。

制約:

- SNS プロバイダの共通インターフェースは存在せず、各所に列挙が散在している（`postSettings` / `postTo` / `postOfType` / 2 箇所の `switch` / `reply_to_ids`）。今回はこの構造を変えず、既存パターンに追随する
- 投稿トークンは PPP-014 により Cloudflare D1 へ AES 暗号化保管され、クライアントには渡らない
- 画像は投稿前に R2 へ一度アップロードされ、各 SNS のバックエンドには公開 URL が渡る

## Goals / Non-Goals

- Goals:
  - misskey.io への テキスト・画像・リプライ投稿と自投稿取得
  - 環境変数の追加ゼロで運用できること
  - Mastodon・Bluesky・Threads の既存動作を変えないこと。唯一の例外は D8 の `getPostId` 堅牢化で、これは「従来は例外で投稿全体が無言中断していた入力」の挙動のみを変える改善である
- Non-Goals:
  - Mastodon の削除、プロバイダ抽象化リファクタリング、Misskey 固有機能（可視性・CW・リアクション）

## Decisions

### D1: 認証は MiAuth を採用し、OAuth 2.0 (IndieAuth) は採用しない

**決定**: MiAuth（`GET /{host}/miauth/{uuid}` → `POST /api/miauth/{uuid}/check`）を用いる。

**理由**: MiAuth はアプリの事前登録が不要で、`client_id` / `client_secret` を持たない。Mastodon 対応では インスタンスごとに `/api/v1/apps` を手作業で叩き、得た値を `frontend/.env`・GitHub Actions Variables・Netlify env の 3 箇所へ登録する運用が必要で、さらに `mastodon_token.js` が環境変数名を 2 つハードコードしているためインスタンス追加にコード変更を要していた。MiAuth はこの運用コストを丸ごと消せる。

**代替案**: Misskey の OAuth 2.0（IndieAuth 拡張）。標準的だが PKCE 必須で `code_verifier` / `code_challenge` / `state` の管理と client metadata の公開ホスティングが必要になり、得られる利点に対して実装量が明確に多い。

### D2: Mastodon 互換 API は使わず、Misskey ネイティブ API を使う

**決定**: `notes/create` / `drive/files/create` / `users/notes` を用いる。

**理由**: misskey.io で `GET /api/v1/instance` が 404 を返し、Mastodon 互換 API 層が存在しないことを実測で確認した。`mastodon_post.js` を汎用化して host を差し替える案は成立しない。

### D3: 接続先ホストはテキスト入力とし、サーバー側で形式を検証する

**決定**: フロントはホスト名のテキスト入力（既定値 `misskey.io`）を提供する。バックエンドは受け取ったホストを外部へ HTTP 要求する前に検証する。

**理由**: MiAuth は事前登録不要なので、任意ホストを許してもコストが増えない。一方、ユーザー入力のホストをバックエンドがそのまま fetch すると SSRF の入口になりうる（`localhost`、プライベート IP、クラウドのメタデータエンドポイント等）。

**検証の射程**: 検証は文字列形式のみで完結させ、次の 3 点に限定する。

1. 英数字・ハイフン・ドットのみで構成され、ドット区切りで 2 ラベル以上（各ラベルはハイフンで開始・終了しない）
2. IPv4 / IPv6 のアドレスリテラルでないこと（`127.0.0.1`、`169.254.169.254`、`[::1]` 等を拒否）
3. `localhost` と一致せず、`.localhost` で終わらないこと

スキームは常に `https` に固定し、ユーザーがスキームやパスを混入させても採用しない（`https://misskey.io/foo` のような入力は 1. の文字種検証で弾かれる）。

**DNS 解決結果を検証しない理由**: 「名前解決して得た IP がプライベート/ループバック/リンクローカルか」を判定するには、Node の `dns.lookup` で全アドレスを解決したうえで、fetch が同じアドレスへ接続することを保証する必要がある（解決と接続の間の TOCTOU、リダイレクト追跡時の再検証も必要）。Netlify Function の実行時間と実装量に対して割に合わず、かつ受け入れ判定も困難（テストごとに DNS を用意する必要がある）なため、実装可能・検証可能な文字列検証へ射程を縮退させた。

**トレードオフ**: (a) 自己ホスト Misskey を `http` や IP で運用しているケースは接続できない。本アプリの用途（個人が misskey.io を使う）では実害がなく、安全側に倒す。(b) `localtest.me`（→ 127.0.0.1）のように公開ドメイン形式でありながら内部アドレスへ解決される名前は素通りする。これは残存リスクとして受容する（Risks に記載）。

### D4: MiAuth の `callback` は使わず、2 ステップ UI にする

**決定**: `callback` パラメータを付けずに認可ページを別タブで開き、ユーザーが戻ってきてボタンを押した時点でバックエンドが `check` を叩く。

**理由**: `callback` を使うと GitHub Pages 上の SPA へのリダイレクト受信処理（Threads 相当の `onMount` 分岐と `history.replaceState`）が増える。MiAuth の `check` はセッション UUID さえ持っていれば任意のタイミングで呼べるため、リダイレクトなしで完結できる。UI 構造は `MastodonConnection.svelte` の 2 ステップを踏襲でき、かつ Mastodon で必要だった認証コードのコピー&ペーストは不要になる。

**注意**: ユーザーが許可前にボタンを押すと `check` は `{"ok":false}` を返す。これを成功扱いすると「接続済みなのに投稿できない」状態になるため、明示的に失敗として扱う。

### D5: 画像は `drive/files/create`（multipart）を使い、`drive/files/upload-from-url` は使わない

**決定**: R2 の公開 URL からバックエンドが画像を取得し、`multipart/form-data` で `drive/files/create` へアップロードして `fileIds` を得る。

**理由**: `drive/files/upload-from-url` は非同期処理でレスポンスにファイル ID が含まれず、完了を Streaming API で待つ必要がある。Netlify Function の実行時間内で完結させるには同期的に ID が返る `drive/files/create` が適する。`form-data` は既にバックエンドの依存に含まれており、`mastodon_post.js` と同じ手法が使える。

### D6: `user_id` は接続時に meta へ保存し、自投稿取得のたびに `/api/i` を呼ばない

**決定**: `misskey_token.js` が MiAuth の `check` レスポンスに含まれる `user.id` / `user.username` を `saveToken` の meta へ格納する。`misskey_posts.js` はこれを読んで `users/notes` を呼ぶ。

**理由**: `mastodon_posts.js` は毎回 `verify_credentials` を呼んでから statuses を取りに行く 2 往復構成になっている。MiAuth はユーザー情報を認可時点で返すため、1 往復に削減できる。

### D7: Misskey への画像アップロードではリサイズを行わない

**決定**: `sharp` によるリサイズ処理を `misskey_post.js` に実装しない。

**理由**: misskey.io の `maxFileSize` は 500 MB であり、本アプリがブラウザでクロップして生成する PNG がこれを超えることは現実的にない。`image-upload` capability は Mastodon の 5 MB 制限に対する固有の対処であり、Misskey には適用しない。

### D8: リプライ ID は既存の `getPostId` を再利用し、裸の ID を受け付けるよう堅牢化する

**決定**: Misskey のノート URL は `https://{host}/notes/{noteId}` で、末尾パスセグメントがそのまま API のノート ID であるため、`MainContent.svelte` の既存 `getPostId`（URL 末尾取得）を再利用する。あわせて `getPostId`（`MainContent.svelte:307-315`）を「`new URL()` が失敗した場合は入力文字列をそのまま ID として返す」よう修正する。

**理由**: Threads は permalink 末尾がショートコードで API の ID と異なるため専用処理が必要だったが（PPP-012）、Misskey にはその問題がない。Mastodon と同じ扱いにできる。自投稿取得のレスポンスにも `id` を含め、グループ選択経由でも手動入力経由でも同じ ID が得られるようにする。

ただし現行の `getPostId` は `new URL(url)` を無条件に呼ぶため、`abcdefg` のような裸の ID を渡すと `TypeError: Invalid URL` を送出する。この例外は `post()` の `catch (error) {}`（`MainContent.svelte:346-348`、本体が空）で握り潰され、Misskey に限らず投稿処理全体が無言で中断する。本 change は「ノート URL またはノート ID の直接入力を受け付ける」ことを要件としているため、この修正は要件充足に必要な最小限の是正である。

**既存 SNS への副作用（意図した改善）**: `getPostId` は Mastodon・Bluesky のリプライ元手動入力でも共有されている。両者の入力欄は placeholder が `"Toot URL or ID"` / `"Post URL or ID"` と ID 入力を許容する体裁でありながら、実際には裸の ID で例外になり投稿全体が無言で中断していた。本修正によりこの潜在バグも解消される。挙動が変わるのは「従来は必ず失敗していた入力」に限られ、URL を入力した場合の結果は変わらない。

**代替案**: Misskey 専用の ID 導出関数を新設して既存 `getPostId` に触れない案。共有関数の潜在バグが残り、同じコードが 2 つ並ぶだけなので採らない。

### D9: 自投稿取得はリノートのみ除外し、自分のリプライは候補に含める

**決定**: `users/notes` へ `withRenotes: false` / `withReplies: true` を送る。

**理由**: 既存 SNS はいずれも自分のリプライを候補に含めている（Mastodon は `/api/v1/accounts/{id}/statuses` を `exclude_replies` 未指定で呼ぶ `mastodon_posts.js:51`、Bluesky は `getAuthorFeed` の既定 `posts_with_replies` `bluesky_posts.js:66`）。Misskey だけリプライを除外すると、(1) スレッドの 2 通目以降へ連ねる運用ができない、(2) クロス投稿されたリプライが `PPP-004-reply-selection` のグループ化で「Mastodon/Bluesky にはあるが Misskey には無いグループ」となり、同じグループを選んでも Misskey だけ通常投稿になる、という機能差が生じる。母集合を他 SNS と揃えることでグループ化の前提（同一内容が全 SNS で候補に並ぶ）が保たれる。

一方リノートは、本文が自分のものではなく、リプライ先としても不適切なため除外する。Mastodon の `/statuses` はブースト（`reblog`）を含むが、本アプリはその除外を行っていない。ここは Misskey のほうが厳しい扱いになるが、リノートは `text` が `null` で候補として意味をなさないため、揃える価値がないと判断した。

## Risks / Trade-offs

- **ユーザー入力ホストによる SSRF** → D3 のホスト検証で緩和。スキームは `https` 固定、ホストは英数字・ハイフン・ドットの 2 ラベル以上のみ許可し、IP アドレスリテラルと `localhost` / `.localhost` を拒否
- **DNS が内部アドレスへ解決される名前（残存リスク）** → `localtest.me` のように公開ドメイン形式でありながら 127.0.0.1 等へ解決される名前は D3 の文字列検証では防げない。名前解決結果の検証は Netlify Function の実行時間・実装量・検証容易性に見合わないため実施せず、残存リスクとして受容する。前提として、(1) 攻撃者が得られるのは「自分のセッションでバックエンドから任意ホストへ POST させる」能力に留まり、応答はエラーとして返るのみで内部情報の読み出し経路が限定的であること、(2) Netlify Function の実行環境に保護すべき内部エンドポイントを置いていないこと、から影響は限定的と判断する
- **`getPostId` の共有関数修正（D8）** → Mastodon・Bluesky のリプライ元手動入力にも影響する。ただし変わるのは「従来は例外で投稿全体が無言中断していた入力」の挙動のみで、退行ではなく改善である。回帰確認は tasks 11.12 で既存 3 SNS の投稿全体（URL 入力・裸の ID 入力の双方）をカバーする
- **MiAuth セッションの取り違え** → セッション UUID は接続操作ごとに新規生成し、再利用しない（Misskey 公式ドキュメントの指示に従う）
- **`{"ok":false}` の成功誤判定** → D4 のとおり明示的に失敗として扱い、UI で再試行を促す
- **プロバイダ列挙の増加** → 4 つ目の SNS 追加により `postOfType` などの列挙箇所が更に増える。抽象化は Mastodon 削除後にまとめて行うほうが手戻りが少ないと判断し、今回は追随に留める

## Migration Plan

新規 SNS の追加のみで、既存データの移行は不要。

- 既存ユーザーの `localStorage`（`ppp_session_id`、`ppp_setting_*`）と D1 の `sns_credentials` 行はそのまま維持される
- Misskey 接続時は、既にセッションがあればそれを再利用して `sns_type='misskey'` の行を追加する（`mastodon_token.js` と同じ挙動）
- ロールバックは Misskey の接続 UI を出さないだけで済み、他 SNS には影響しない

## Open Questions

なし（認証方式・接続先指定方法・Mastodon の扱いは Issue #25 で確定済み）。
