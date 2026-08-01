# Implementation Tasks

## 1. 型定義（func.ts）

- [x] 1.1 `SettingDataMisskey` 型を追加する（`type: 'misskey'`, `title: 'Misskey'`, `enabled: boolean`, `host: string`, `username: string`）。既存の `SettingDataMastodon` / `SettingDataThreads` に倣い `title` リテラルを持たせる
- [x] 1.2 `SettingData` ユニオンに `SettingDataMisskey` を追加する（`SettingType` は `SettingData['type']` から導出されるため自動的に `'misskey'` を含む）
- [x] 1.3 `SettingDataType<T>` の条件型に `T extends 'misskey' ? SettingDataMisskey :` を追加する。末尾は `SettingDataBluesky` へのフォールバックのため、追加を怠ると `misskey` が Bluesky 型に解決されてしまう点に注意する
- [x] 1.4 `savePostSetting` / `loadPostSetting` / `deletePostSetting` は型駆動のため変更不要であることを確認する（`localStorage` キーは自動的に `ppp_setting_misskey`）

## 2. 接続 UI（MisskeyConnection.svelte）

- [x] 2.1 `frontend/src/lib/MisskeyConnection.svelte` を新規作成する（`MastodonConnection.svelte` の折りたたみ構造・接続済み表示・切断ボタンを踏襲）
- [x] 2.2 接続先ホストのテキスト入力を設ける（`bind:value={misskeyHost}`、初期値 `'misskey.io'`）。`config.ts` の `post_targets` にはエントリを追加しない
- [x] 2.3 「1. Misskey サーバーに接続」ボタンで `crypto.randomUUID()` により MiAuth セッション UUID を生成してコンポーネント状態に保持し、`https://{host}/miauth/{uuid}?name=PPPOST&permission=write:notes,write:drive,read:account`（各値は URL エンコード）を `window.open(url, '_blank')` で開く
- [x] 2.4 「2. 接続を完了」ボタンで `GET ${Config.API_ENDPOINT}/misskey_token?host={host}&session={uuid}` を呼ぶ。既存セッションがあれば `Authorization: Bearer {ppp_session_id}` を付与する（`MastodonConnection.svelte:38-44` と同じ扱い）
- [x] 2.5 Mastodon にある認証コードの貼り付け入力は設けない（MiAuth はコードの手動転記を要さないため）
- [x] 2.6 成功時は `saveSessionId(resJson.session_id)` と `savePostSetting({ type:'misskey', title:'Misskey', enabled:true, host, username })` を行い `dispatch('onChange')` する
- [x] 2.7 バックエンドが失敗を返した場合（未認可を含む）は接続済みにせず、ユーザーへエラーを通知して再試行できる状態を保つ
- [x] 2.8 UUID は接続操作ごとに新規生成し、再利用しない（「1.」ボタンを押すたびに生成し直す）
- [x] 2.9 切断は `POST ${Config.API_ENDPOINT}/sns_disconnect`（`{ sns_type: 'misskey' }`、Bearer 付き）を呼び、`deletePostSetting('misskey')` + `dispatch('onChange')` を行う

## 3. UI 統合（MainContent.svelte）

- [x] 3.1 `import MisskeyConnection from "./MisskeyConnection.svelte"` を追加する
- [x] 3.2 投稿対象チェックボックス行（`bind:checked={postTo.misskey}`, `disabled={postSettings.misskey == null}`）と `<MisskeyConnection on:onChange={onChangePostSettings} />` を既存 3 SNS と並べて追加する
- [x] 3.3 投稿ボタン横に Misskey アイコンを `{#if postSettings.misskey != null && postTo.misskey}` で追加する。Bootstrap Icons に Misskey は無いため、Bluesky と同様にインライン SVG のパスを直接埋め込む
- [x] 3.4 `onChangePostSettings` に `postSettings.misskey = loadPostSetting('misskey')` を追加する
- [x] 3.5 `postOfType` / `replyToPost` の初期化箇所すべて（3 箇所）に `misskey: undefined` を追加する
- [x] 3.6 `replyToIdForMisskey` 変数を追加し、リプライ手動入力欄（Misskey アイコン + `placeholder="Note URL or ID"`）を Mastodon・Bluesky の欄と並べて追加する
- [x] 3.7 `post()` の `reply_to_ids` に `misskey: getPostId(replyToPost?.postOfType['misskey']?.url ?? replyToIdForMisskey)` を追加する（Misskey のノート URL は末尾がそのままノート ID のため既存 `getPostId` を使う。グループに Misskey の投稿が無い場合は手動入力欄へフォールバックする既存 SNS と同じ構造）
- [x] 3.8 `getPostId`（`MainContent.svelte:307-315`）を堅牢化する。`new URL(url)` を `try` で囲み、パースに失敗した場合は入力文字列をそのままトリムして返す（`design.md` D8）。現行実装は裸の ID で `TypeError` を送出し、`post()` の空の `catch` に握り潰されて Mastodon・Bluesky・Threads を含む投稿処理全体が無言で中断するため、Misskey の「ノート URL またはノート ID の直接入力」要件の充足に必須である
- [x] 3.9 投稿成功時と Clear ボタンで `replyToIdForMisskey` をクリアする

## 4. 投稿処理（MainContent.ts）

- [x] 4.1 `postSettings` に `misskey: loadPostSetting('misskey')` を、型定義に `misskey: SettingDataMisskey | null` を追加する
- [x] 4.2 `postTo` に `misskey: postSettings?.misskey?.enabled ?? false` を追加する
- [x] 4.3 `postToSns` の `options.reply_to_ids` の型に `misskey: string` を追加する
- [x] 4.4 `postToMisskey(text, imageUrls, reply_to_id): Promise<boolean>` を追加する（`POST ${Config.API_ENDPOINT}/misskey_post` に `buildAuthHeaders('application/json')` で `{ text, images, reply_to_id }` を送り `res.ok` を返す）
- [x] 4.5 `postToSns` の `switch` に `case 'misskey'` を追加し、失敗時 `errors.push('Misskey')` とする
- [x] 4.6 `loadMyPostsMisskey(): Promise<Post[]>` を追加する（`POST ${Config.API_ENDPOINT}/misskey_posts`、失敗時は空配列を返す）
- [x] 4.7 `loadMyPosts` の `switch` に `case 'misskey'` を追加する
- [x] 4.8 `groupByText` 内の `postOfType` 初期化に `misskey: undefined` を追加する

## 5. バックエンド: ホスト検証（lib）

- [x] 5.1 `backend/netlify/lib/misskey-host.js` を新規作成し、ユーザー入力ホストを検証する関数を実装する（`lib/session.js` 等と同じ CommonJS 形式）
- [x] 5.2 検証は文字列形式のみとし、次の 3 点に限定する（`design.md` D3）。(a) 英数字・ハイフン・ドットのみで構成され、ドット区切りで 2 ラベル以上、各ラベルがハイフンで開始・終了しないこと（例: `/^[A-Za-z0-9]([A-Za-z0-9-]*[A-Za-z0-9])?(\.[A-Za-z0-9]([A-Za-z0-9-]*[A-Za-z0-9])?)+$/`）、(b) 全ラベルが数値の IPv4 形式および `:` を含む IPv6 形式（`[` `]` 付きを含む）を拒否、(c) `localhost` と一致するもの・`.localhost` で終わるものを拒否。DNS 解決結果の判定は行わない
- [x] 5.3 スキームは常に `https` として組み立て、入力に含まれるスキーム・パス・クエリは採用しない（`https://misskey.io/foo` のような入力は 5.2 (a) の文字種検証で弾かれる）
- [x] 5.4 MiAuth セッション識別子が UUID 形式（`/^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/`）であることを検証する関数も同ファイルに実装する（`check` の URL パスへ埋め込むため）
- [x] 5.5 検証に失敗した場合は外部要求を行わず、呼び出し側が 400 を返せるようにする

## 6. バックエンド: 接続（misskey_token.js）

- [x] 6.1 `backend/netlify/functions/misskey_token.js` を新規作成する（`mastodon_token.js` と同型の CORS プリフライト対応。`Access-Control-Allow-Headers` に `Authorization` を含める）
- [x] 6.2 クエリ `host` と `session`（MiAuth セッション UUID）を受け取り、5. のホスト検証と UUID 形式検証（5.4）を通す。いずれかに失敗した場合は Misskey インスタンスへ要求せず 400 を返す
- [x] 6.3 `POST https://{host}/api/miauth/{session}/check` を呼び出す
- [x] 6.4 応答が `{ ok: false }` の場合は保存を行わず、400 とエラー内容を返す
- [x] 6.5 `ok: true` の場合、セッション ID を `extractSessionId(event) ?? generateSessionId()` で決定し、`saveToken(sessionId, 'misskey', { access_token: token }, { host, user_id: user.id, username: user.username })` で D1 に暗号化保管する
- [x] 6.6 レスポンスは `{ session_id, host, username }` のみとし、アクセストークンを含めない
- [x] 6.7 環境変数は追加しない（MiAuth はアプリ登録・client_secret を要さない）

## 7. バックエンド: 投稿（misskey_post.js）

- [x] 7.1 `backend/netlify/functions/misskey_post.js` を新規作成する（OPTIONS プリフライト対応。`mastodon_post.js` のセッション検証・`getToken` 部分を踏襲）
- [x] 7.2 `extractSessionId` が `null` なら 401、`getToken(sessionId, 'misskey')` が `null` なら 400 を返す
- [x] 7.3 `stored.meta.host` を 5. のホスト検証に通したうえで接続先を組み立て、`stored.token.access_token` を `Authorization: Bearer` に用いる
- [x] 7.4 body `{ text, images, reply_to_id }` を受け取る
- [x] 7.5 `images` が 1 件以上ある場合、各 URL から画像を取得し `POST https://{host}/api/drive/files/create` へ `multipart/form-data`（`form-data` パッケージ使用）でアップロードしてファイル ID を収集する。リサイズ処理は実装しない
- [x] 7.6 いずれかの画像アップロードに失敗した場合はノートを作成せずエラーステータスを返す
- [x] 7.7 `POST https://{host}/api/notes/create` に `{ text, visibility: 'public' }` を送る。ファイル ID がある場合のみ `fileIds` を、`reply_to_id` が空でない場合のみ `replyId` を含める（`fileIds` は空配列を送らない）
- [x] 7.8 `text` が空かつ画像もない場合は Misskey API を呼ばず 400 を返す
- [x] 7.9 成功時は `{ id, url }`（`url` は `https://{host}/notes/{id}`）を返す。失敗時は Misskey の応答内容をログ出力し、エラーステータスを返す

## 8. バックエンド: 自投稿取得（misskey_posts.js）

- [x] 8.1 `backend/netlify/functions/misskey_posts.js` を新規作成する（`mastodon_posts.js` と同型の CORS・セッション検証）
- [x] 8.2 `stored.meta` から `host` と `user_id` を取得する（`/api/i` は呼ばない）
- [x] 8.3 `POST https://{host}/api/users/notes` に `{ userId, withRenotes: false, withReplies: true, limit: 20 }` を送る（自分のリプライは Mastodon・Bluesky と同様に候補へ含める。リノートのみ除外。`design.md` D9）
- [x] 8.4 応答を `{ url, posted_at, text, id }` の配列へ変換する（`url = https://{host}/notes/{note.id}`、`posted_at = note.createdAt`、`text = note.text ?? ''`、`id = note.id`）。Mastodon 版の JSDOM による HTML デコードは行わない
- [x] 8.5 失敗時は 4xx/5xx を返し、フロント側で空配列にフォールバックされることを確認する

## 9. バックエンド: 切断（sns_disconnect.js）

- [x] 9.1 `SNS_TYPES` に `'misskey'` を追加する

## 10. ドキュメント

- [x] 10.1 `README.md` の投稿先一覧・アーキテクチャ説明に Misskey を追記する
- [x] 10.2 `backend/test.http` に Misskey の手動確認用リクエスト（`miauth check`、`notes/create`、`drive/files/create`）を追記する
- [x] 10.3 環境変数の追加が不要であることを確認する（`backend/.env.example` / `frontend/.env` / `.github/workflows/deploy_github_pages.yml` を変更しない）
- [ ] 10.4 archive 時に `openspec/specs/sns-posting/spec.md` の `## Purpose` を「投稿対象は Mastodon・Bluesky・Threads・Misskey とし、Twitter (X) はフロントエンドから廃除する」へ手動で書き換える。OpenSpec の archive は `## Requirements` セクションのみを差し替え、Purpose を含む前段の本文は原文のまま残すため、放置すると MODIFIED した要件と Purpose が spec 内で矛盾する
- [ ] 10.5 archive 時に `openspec/specs/misskey-posting/spec.md` の `## Purpose` を、本 change の delta 冒頭 `## Overview` の内容で置き換える（archive が自動生成する `TBD - created by archiving change ...` を残さない）
- [ ] 10.6 archive 時に `openspec/specs/image-upload/spec.md` の `## Purpose` を「Mastodon への画像アップロード時に、API のファイルサイズ上限を超えないよう自動リサイズする機能」へ限定する。現行の「各 SNS への画像アップロード時に…」という一般化された記述は、Misskey にリサイズを適用しない本 change の方針（`design.md` D7）と読み合わせると誤解を招くため（要件本文は Mastodon 限定のままで変更不要）

## 11. 動作検証

- [x] 11.1 `cd frontend && npm run check` が型エラーなく成功することを確認する（特に `SettingDataType` への `misskey` 分岐追加漏れ）
- [x] 11.2 `cd frontend && npm run build` が成功することを確認する
- [ ] 11.3 接続ボタン → MiAuth で許可 → 接続完了で「接続済み」表示になることを確認する
- [ ] 11.4 D1 に `sns_type='misskey'` の行が作られ、`enc_token` が平文でないことを確認する（`npx wrangler d1 execute pppost --remote --command "SELECT session_id, sns_type, updated_at FROM sns_credentials WHERE sns_type='misskey'"`）
- [ ] 11.5 MiAuth で許可する前に「接続を完了」を押した場合、接続済みにならずエラーが通知されることを確認する
- [ ] 11.6 Misskey チェックボックス ON でテキスト投稿が成功することを確認する
- [ ] 11.7 画像 2 枚を添付した投稿が成功し、ノートに画像が付くことを確認する
- [ ] 11.8 リプライ元選択 UI に Misskey の自投稿が表示され、選択して返信できることを確認する
- [ ] 11.9 リプライ手動入力欄に `https://misskey.io/notes/xxxx` を貼って返信できることを確認する
- [ ] 11.10 リプライ手動入力欄に URL ではないノート ID（`xxxx` の部分のみ）を貼って返信できること、および他 SNS を同時選択していても投稿処理が中断しないことを確認する（3.8 の `getPostId` 堅牢化の裏取り）
- [ ] 11.11 切断後にチェックボックスが無効化され、D1 の該当行が削除されることを確認する
- [ ] 11.12 Mastodon・Bluesky・Threads への投稿が従来通り動作することを確認する（同時投稿を含む。リプライ手動入力欄への URL 入力・裸の ID 入力の双方を含める）
- [ ] 11.13 バックエンドに `host=localhost`・`host=127.0.0.1`・`host=169.254.169.254`・`host=[::1]`・`host=https://misskey.io/foo` を渡した場合、いずれも外部要求が行われず 400 になることを確認する（`backend/test.http` から実行）
- [ ] 11.14 `session` に UUID 形式でない値（`../../api/i` 等）を渡した場合、Misskey インスタンスへ要求されず 400 になることを確認する
- [ ] 11.15 画像 2 枚のうち 1 枚のアップロードを失敗させた場合（不正な画像 URL を渡す等）に、Misskey にノートが作成されないこと、およびエラー一覧に `Misskey` が含まれることを確認する
- [ ] 11.16 Misskey の自投稿取得が失敗する状態（トークンを D1 から削除する等）で、リプライ元選択 UI のローディングが解除され、Mastodon・Bluesky・Threads の候補が従来通り表示されることを確認する
- [ ] 11.17 3000 文字を超える本文で投稿し、Misskey のみ失敗してエラー一覧に `Misskey` が表示されることを確認する（他の選択中 SNS の投稿は妨げられないこと）
- [ ] 11.18 `misskey.io` 以外のインスタンス（テスト用アカウントを持つ任意のホスト）を入力し、環境変数の追加や再デプロイなしに接続・投稿できることを確認する
- [ ] 11.19 画像なしのテキストのみ投稿で、`notes/create` のリクエストボディに `fileIds` が含まれないことを確認する（バックエンドのログまたは `backend/test.http` で確認）
- [ ] 11.20 Misskey のリプライ元候補に自分のリプライが含まれ、リノートが含まれないことを確認する（8.3 の `withReplies: true` / `withRenotes: false` の裏取り）
