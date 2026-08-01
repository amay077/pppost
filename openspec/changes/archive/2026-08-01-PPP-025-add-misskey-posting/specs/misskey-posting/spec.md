# Misskey Posting

## Overview

MiAuth + Misskey ネイティブ API を用いた Misskey アカウント接続・テキスト/画像/リプライ投稿・自投稿取得機能の仕様。接続先インスタンスはユーザーがホスト名で指定し（既定値 `misskey.io`）、アプリの事前登録・環境変数の追加を要さない。投稿対象 SNS として Mastodon・Bluesky・Threads に Misskey を追加する。

## ADDED Requirements

### Requirement: Misskey アカウント接続（Connect Misskey account via MiAuth）

システムは、ユーザーが Misskey 接続を要求したとき、接続操作ごとに新規生成した UUID をセッション識別子として `https://{host}/miauth/{uuid}` の認可ページを別タブで開かなければならない (SHALL)。認可ページには、アプリ名（`name`）と、投稿・ドライブ・アカウント情報の取得に必要な権限（`permission=write:notes,write:drive,read:account`）を指定しなければならない (SHALL)。システムは MiAuth のセッション識別子を接続操作間で再利用してはならない (SHALL NOT)。

ユーザーが認可を完了した後、システムは `POST https://{host}/api/miauth/{uuid}/check` をバックエンド経由で呼び出してアクセストークンを取得し、`credential-custody` capability に従ってサーバー側の保管庫（Cloudflare D1）へ `sns_type` を `misskey` として暗号化保存しなければならない (SHALL)。同時に、応答に含まれるユーザー識別子（`user.id`）・ユーザー名（`user.username`）・接続先ホストを表示用メタとして保管しなければならない (SHALL)。システムはアクセストークンをクライアントへ返し `localStorage` に保存してはならない (SHALL NOT)。

Misskey の MiAuth はアプリの事前登録を要さないため、システムは `client_id` や `client_secret` に相当する秘密情報を保持してはならない (SHALL NOT)。

`check` の URL パスにはクライアント由来のセッション識別子が埋め込まれるため、バックエンドは `check` を呼び出す前にセッション識別子が UUID 形式（`xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx` の 16 進数とハイフンのみ）であることを検証しなければならない (SHALL)。UUID 形式でない値を受け取った場合、システムは Misskey インスタンスへの要求を行ってはならない (SHALL NOT)。

`check` の応答が `{"ok": false}`（ユーザーが未だ認可していない、またはセッションが無効）である場合、システムは接続を成立させてはならず (SHALL NOT)、失敗としてユーザーへ通知しなければならない (SHALL)。

#### Scenario: Misskey に接続する（Connect to Misskey）

- **GIVEN** ユーザーが Misskey に未接続である
- **WHEN** 接続ボタンを押下し、別タブで開いた MiAuth の認可ページで許可し、アプリに戻って接続完了を指示する
- **THEN** バックエンドが `check` を呼び出してアクセストークンを取得する
- **AND** トークンは D1 に暗号化保存され、クライアントにはセッション ID と表示用メタのみが返る
- **AND** Misskey が「接続済み」として表示され、投稿対象チェックボックスが有効になる

#### Scenario: 認可前に接続完了を指示する（Complete pressed before authorization）

- **GIVEN** ユーザーが MiAuth の認可ページでまだ許可していない
- **WHEN** アプリで接続完了を指示する
- **THEN** `check` が `{"ok": false}` を返すため接続は成立せず、失敗がユーザーへ通知される
- **AND** Misskey は「未接続」のままで、投稿対象チェックボックスは無効のままである

#### Scenario: 不正な形式のセッション識別子を拒否する（Reject malformed session identifier）

- **GIVEN** バックエンドが `session` として `../../api/i` のような UUID 形式でない値を受け取る
- **WHEN** 接続完了の要求を処理する
- **THEN** `check` を含む Misskey インスタンスへの要求は行われず、エラーが返る
- **AND** トークンは保管されず、接続は成立しない

#### Scenario: Misskey を切断する（Disconnect Misskey）

- **GIVEN** ユーザーが Misskey に接続済みである
- **WHEN** 切断ボタンを押下する
- **THEN** サーバー保管庫から当該セッションの Misskey トークンが削除される
- **AND** Misskey の投稿対象チェックボックスが無効化される

#### Scenario: 未接続時は投稿対象に選択できない（Cannot select when not connected）

- **GIVEN** ユーザーが Misskey に接続していない
- **WHEN** 投稿対象 SNS の選択肢を確認する
- **THEN** Misskey のチェックボックスは無効化されている

### Requirement: 接続先ホストの指定と検証（Specify and validate target host）

システムは、接続先の Misskey インスタンスをユーザーがホスト名のテキスト入力で指定できるようにしなければならない (SHALL)。初期値は `misskey.io` とする。MiAuth はアプリの事前登録を要さないため、システムは接続先インスタンスを環境変数や事前定義リストで制限してはならない (SHALL NOT)。

バックエンドは、ユーザー由来のホスト名を用いて外部へ HTTP 要求を行う前に、そのホスト名を文字列として検証しなければならない (SHALL)。検証は次の 3 点に限る。

1. ホスト名が英数字・ハイフン・ドットのみで構成され、ドットで区切られた 2 つ以上のラベルを持つこと（各ラベルはハイフンで開始・終了しない）
2. IPv4 アドレスリテラル（`127.0.0.1`、`169.254.169.254` など全 4 オクテット数値の形式）および IPv6 アドレスリテラル（`:` を含む形式、`[::1]` のようなブラケット表記を含む）でないこと
3. `localhost` と一致せず、`.localhost` で終わらないこと

上記 3 点をすべて満たす入力のみを有効とし、いずれかを満たさない入力に対してシステムは外部要求を行ってはならない (SHALL NOT)。本検証は文字列形式のみを対象とし、システムはホスト名の DNS 解決結果が内部アドレスを指すか否かを判定することを要しない（`localtest.me` のような公開ドメイン形式の名前が内部アドレスへ解決される経路は防がない。残存リスクは `design.md` の Risks / Trade-offs に記録する）。

システムは接続先スキームを常に `https` として扱わなければならず (SHALL)、ユーザー入力に含まれるスキーム・パス・クエリを接続先の組み立てに採用してはならない (SHALL NOT)。

#### Scenario: 既定のホストで接続する（Connect with default host）

- **GIVEN** ユーザーが Misskey の接続欄を開いた
- **WHEN** ホスト名の入力欄を確認する
- **THEN** 初期値として `misskey.io` が入力されている
- **AND** そのまま接続操作を行うと `https://misskey.io` に対して MiAuth が開始される

#### Scenario: 別のインスタンスに接続する（Connect to another instance）

- **GIVEN** ユーザーが `misskey.io` 以外の Misskey インスタンスを利用している
- **WHEN** ホスト名の入力欄にそのインスタンスのホスト名を入力して接続操作を行う
- **THEN** 環境変数の追加や設定変更なしに、そのインスタンスに対して MiAuth が開始される

#### Scenario: 内部アドレスへの要求を拒否する（Reject internal address）

- **GIVEN** ホスト名として `localhost`、`127.0.0.1`、`192.168.1.10`、`169.254.169.254`、`[::1]` のいずれかが指定される
- **WHEN** バックエンドがそのホストを受け取る
- **THEN** 検証に失敗し、外部への HTTP 要求は行われず、エラーが返る

#### Scenario: スキームやパスを含む入力を拒否する（Reject input containing scheme or path）

- **GIVEN** ホスト名として `https://misskey.io/foo` や `misskey.io/api` が指定される
- **WHEN** バックエンドがそのホストを受け取る
- **THEN** 英数字・ハイフン・ドット以外の文字を含むため検証に失敗し、外部への HTTP 要求は行われず、エラーが返る

### Requirement: Misskey へのテキスト投稿（Post text to Misskey）

システムは、Misskey が投稿対象に選択されているとき、入力テキストをバックエンド経由で `POST https://{host}/api/notes/create` へ送信して投稿しなければならない (SHALL)。バックエンドは、クライアントから受け取ったトークンではなく、`credential-custody` に従いセッションに紐づく保管トークンを復号して `Authorization: Bearer` に用いなければならない (SHALL)。

投稿の可視性は `public` としなければならない (SHALL)。画像を添付して投稿する場合の振る舞いは `### Requirement: Misskey への画像投稿` に、リプライ元が選択されている場合の振る舞いは `### Requirement: Misskey へのリプライ投稿` に従う。

Misskey は本文と添付ファイルの双方が空のノートを受け付けないため、システムは本文が空かつ添付画像もない場合に Misskey への投稿を試行してはならない (SHALL NOT)。

投稿に失敗した場合、システムは失敗を無言で握りつぶしてはならず (SHALL NOT)、エラー一覧に `Misskey` を含めてユーザーへ通知しなければならない (SHALL)。

#### Scenario: テキストを Misskey に投稿する（Post text successfully）

- **GIVEN** ユーザーが Misskey に接続済みで、投稿対象チェックボックスが ON、本文が入力されている
- **AND** 画像を添付しておらず、リプライ元も選択していない
- **WHEN** 投稿ボタンを押下する
- **THEN** `notes/create` により本文のみのノートが公開範囲 `public` で作成される
- **AND** Mastodon・Bluesky・Threads など他の選択中 SNS への投稿と並行して成功通知が表示される

#### Scenario: 投稿に失敗する（Post fails）

- **GIVEN** ユーザーが Misskey を投稿対象に選択している
- **AND** `notes/create` が失敗する状態である
- **WHEN** 投稿ボタンを押下する
- **THEN** エラー一覧に `Misskey` が含まれ、ユーザーへ投稿失敗が通知される

#### Scenario: 保管トークンがない場合は失敗する（Fails when token not stored）

- **GIVEN** セッションに Misskey のトークンが保管されていない
- **WHEN** Misskey への投稿が要求される
- **THEN** Misskey API は呼び出されず、投稿は失敗として扱われる

### Requirement: Misskey への画像投稿（Post images to Misskey）

システムは、ユーザーが画像を添付して Misskey 投稿を実行したとき、R2 に一時保存された公開 URL からバックエンドが画像を取得し、`POST https://{host}/api/drive/files/create` へ `multipart/form-data` でアップロードして得たファイル ID を、`notes/create` の `fileIds` に指定しなければならない (SHALL)。

`notes/create` の `fileIds` は空配列を受け付けないため、システムは添付画像がない場合に `fileIds` を送信してはならない (SHALL NOT)。

misskey.io のファイルサイズ上限は 500 MB であり、本アプリが扱う画像がこれを超えることはないため、システムは Mastodon 向けに実装されている 5 MB 超過時の自動リサイズ（`image-upload` capability）を Misskey への投稿に適用してはならない (SHALL NOT)。

いずれかの画像のアップロードに失敗した場合、システムはノートを作成してはならず (SHALL NOT)、その投稿全体を失敗として扱い、エラー一覧に `Misskey` を含めてユーザーへ通知しなければならない (SHALL)。

#### Scenario: 画像付きで投稿する（Post with images）

- **GIVEN** ユーザーが本文と画像 2 枚を入力し、Misskey にチェックを入れている
- **WHEN** 投稿ボタンを押下する
- **THEN** 2 枚の画像が `drive/files/create` でドライブへアップロードされる
- **AND** 得られたファイル ID が `fileIds` に指定されたノートが作成され、画像付き投稿として表示される

#### Scenario: テキストのみ投稿する（Text only post）

- **GIVEN** ユーザーが本文のみ入力し（画像なし）、Misskey にチェックを入れている
- **WHEN** 投稿ボタンを押下する
- **THEN** `fileIds` を含まないノートが作成され、テキストのみの投稿が完了する

#### Scenario: 画像アップロードに失敗する（Image upload fails）

- **GIVEN** ユーザーが本文と画像 2 枚を入力し、Misskey にチェックを入れている
- **AND** そのうち 1 枚のドライブへのアップロードが失敗する状態である
- **WHEN** 投稿ボタンを押下する
- **THEN** ノートは作成されず、Misskey 投稿が失敗として扱われる
- **AND** エラー一覧に `Misskey` が含まれ、ユーザーへ投稿失敗が通知される

#### Scenario: 5 MB 超の画像もリサイズされない（Large image is not resized）

- **GIVEN** ユーザーが 8 MB の画像を添付し、Misskey にチェックを入れている
- **WHEN** 投稿ボタンを押下する
- **THEN** 画像はリサイズも形式変換もされずそのままドライブへアップロードされ、投稿が完了する

### Requirement: Misskey の自投稿取得（Fetch own Misskey posts）

システムは、ユーザーがリプライ元選択 UI を展開したとき、Misskey に接続済みであれば、バックエンド経由で `POST https://{host}/api/users/notes` を呼び出して自投稿一覧を取得し、Mastodon・Bluesky・Threads の自投稿と同様にリプライ元候補として表示しなければならない (SHALL)。

対象ユーザーの識別子は、接続時に保管した表示用メタ（`user.id`）から解決しなければならない (SHALL)。リプライ元候補として不適切であるため、システムはリノート（`withRenotes`）を取得対象に含めてはならない (SHALL NOT)。一方、Mastodon（`exclude_replies` を指定しない）・Bluesky（`getAuthorFeed` の既定 `posts_with_replies`）が自分のリプライを候補に含めているため、システムは自分のリプライ（`withReplies`）を取得対象に含めなければならない (SHALL)。これにより、スレッドの 2 通目以降へ連ねる運用と、`PPP-004-reply-selection` のグループ化における他 SNS との候補集合の一致が保たれる。

取得した各投稿について、システムはノート ID と、`https://{host}/notes/{noteId}` 形式の URL を保持しなければならない (SHALL)。画像のみのノートは `text` が `null` となるため、システムは本文を空文字として扱わなければならず (SHALL)、`text` を持たない投稿を候補から除外したり、処理を中断したりしてはならない (SHALL NOT)。

Misskey の自投稿取得に失敗した場合でも、システムは他の SNS の自投稿候補の表示を妨げてはならない (SHALL NOT)。また、取得の成否にかかわらず、リプライ元選択 UI がローディング表示のまま固定されてはならない (SHALL NOT)。

#### Scenario: 接続済みで自投稿が候補に表示される（Own posts appear as reply candidates）

- **GIVEN** ユーザーが Misskey に接続済みで、Misskey の投稿対象チェックボックスが ON であり、Misskey に投稿が存在する
- **WHEN** リプライ元選択 UI を展開する
- **THEN** Misskey の自投稿がリプライ元候補のドロップダウンに表示される

#### Scenario: 自分のリプライは候補に含まれ、リノートは含まれない（Own replies included, renotes excluded）

- **GIVEN** ユーザーの Misskey アカウントに、通常のノート・自分が付けたリプライ・他者のノートのリノートが存在する
- **AND** Misskey の投稿対象チェックボックスが ON である
- **WHEN** リプライ元選択 UI を展開する
- **THEN** 通常のノートと自分が付けたリプライが候補に表示される
- **AND** リノートは候補に表示されない

#### Scenario: 未接続時は取得しない（No fetch when not connected）

- **GIVEN** ユーザーが Misskey に接続していない
- **WHEN** リプライ元選択 UI を展開する
- **THEN** Misskey の自投稿取得 API は呼び出されない
- **AND** 他の SNS の自投稿候補は従来通り表示される

#### Scenario: Misskey の取得失敗は他 SNS に影響しない（Fetch failure does not block other SNS）

- **GIVEN** ユーザーが Misskey に接続済みで投稿対象チェックボックスが ON だが、Misskey の自投稿取得が失敗する状態である
- **WHEN** リプライ元選択 UI を展開する
- **THEN** Mastodon・Bluesky・Threads の自投稿候補は従来通り表示される
- **AND** リプライ元選択 UI のローディング表示は解除される

#### Scenario: 画像のみの自投稿を候補に含める（Image-only note appears as candidate）

- **GIVEN** ユーザーが Misskey に接続済みで投稿対象チェックボックスが ON であり、本文を持たない画像のみのノートが存在する
- **WHEN** リプライ元選択 UI を展開する
- **THEN** 画像のみのノートも本文を空文字として候補に表示され、エラーで処理が中断しない

### Requirement: Misskey へのリプライ投稿（Post reply to Misskey）

システムは、リプライ元として Misskey の自投稿が選択されているとき、`notes/create` に `replyId` を指定してリプライとして投稿しなければならない (SHALL)。画像付きの場合も同様に `replyId` を付与しなければならない (SHALL)。

Misskey のノート URL は `https://{host}/notes/{noteId}` であり、末尾のパスセグメントがそのまま API のノート ID であるため、システムは URL の末尾のパスセグメントをノート ID として導出しなければならない (SHALL)。システムは、リプライ元選択ドロップダウンで選択された自投稿からの導出と、ユーザーがノート URL またはノート ID を直接入力する手動指定の双方を受け付けなければならない (SHALL)。ノート ID が URL の形をとらない文字列（`abcdefg` など）で入力された場合、システムはそれをそのままノート ID として扱わなければならず (SHALL)、例外により投稿処理を中断してはならない (SHALL NOT)。

リプライ元の解決順序は、選択されたリプライ元グループに含まれる Misskey の投稿を優先し、それがない場合は手動入力欄の値を用いるものとする (SHALL)。選択されたリプライ元グループに Misskey の投稿が含まれず、かつ手動入力欄も空である場合、およびリプライ元を選択も入力もしていない場合、システムは `replyId` を付与せず通常投稿として処理しなければならない (SHALL)。

リプライ投稿に失敗した場合、システムはエラー一覧に `Misskey` を含めてユーザーへ通知しなければならない (SHALL)。

#### Scenario: 自投稿を選択してリプライする（Reply to own note）

- **GIVEN** ユーザーが Misskey に接続済みで、リプライ元として Misskey の自投稿を選択し、本文を入力している
- **WHEN** 投稿ボタンを押下する
- **THEN** `notes/create` に `replyId` が付与され、選択した自投稿へのリプライとして公開される

#### Scenario: ノート URL を手動入力してリプライする（Reply via manually entered URL）

- **GIVEN** ユーザーが Misskey を投稿対象に選択し、リプライ元手動入力欄に `https://misskey.io/notes/xxxx` を入力している
- **WHEN** 投稿ボタンを押下する
- **THEN** URL 末尾のノート ID が `replyId` として付与され、その投稿へのリプライとして公開される

#### Scenario: ノート ID を手動入力してリプライする（Reply via manually entered note ID）

- **GIVEN** ユーザーが Misskey を投稿対象に選択し、リプライ元手動入力欄に URL ではないノート ID（`abcdefg`）を入力している
- **WHEN** 投稿ボタンを押下する
- **THEN** 入力値がそのまま `replyId` として付与され、その投稿へのリプライとして公開される
- **AND** URL としてパースできないことによる例外で、Misskey および他 SNS への投稿処理が中断しない

#### Scenario: グループに Misskey の投稿が無く手動入力がある（Group without Misskey note falls back to manual input）

- **GIVEN** ユーザーがリプライ元手動入力欄に Misskey のノート URL を入力したうえで、Misskey の投稿を含まないリプライ元グループを選択している
- **WHEN** 投稿ボタンを押下する
- **THEN** 手動入力欄の値から導出したノート ID が `replyId` として付与される

#### Scenario: グループに Misskey の投稿が無く手動入力も無い（Group without Misskey note and no manual input）

- **GIVEN** ユーザーが Misskey の投稿を含まないリプライ元グループを選択し、リプライ元手動入力欄は空である
- **WHEN** 投稿ボタンを押下する
- **THEN** `replyId` なしの通常投稿として公開される

#### Scenario: リプライ元未指定時は通常投稿（Normal post without reply）

- **GIVEN** ユーザーが Misskey を投稿対象に選択し、リプライ元を選択も入力もしていない
- **WHEN** 投稿ボタンを押下する
- **THEN** `replyId` なしの通常投稿として公開される

#### Scenario: リプライ失敗時の通知（Reply failure notification）

- **GIVEN** ユーザーがリプライ元として Misskey の自投稿を指定している
- **AND** リプライ投稿が失敗する状態である（元ノートの削除など）
- **WHEN** 投稿ボタンを押下する
- **THEN** エラー一覧に `Misskey` が含まれ、ユーザーへ投稿失敗が通知される

### Requirement: Misskey 本文の文字数上限（Misskey text length limit）

システムは、Misskey 本文がインスタンスの上限（misskey.io では 3000 文字）を超える場合、Misskey への投稿を失敗として扱い、ユーザーに通知しなければならない (SHALL)。上限はインスタンスごとに設定可能であるため、システムは上限値をアプリ側に固定値として持ってはならず (SHALL NOT)、上限超過は Misskey API のエラー応答を介して投稿失敗として扱わなければならない (SHALL)。Misskey 専用の文字数カウンタ表示は設けない。

#### Scenario: 上限を超える本文（Text exceeds instance limit）

- **GIVEN** Misskey が投稿対象に選択されている
- **AND** 本文がインスタンスの文字数上限を超えている
- **WHEN** 投稿ボタンを押下する
- **THEN** Misskey への投稿が失敗する
- **AND** エラー一覧に `Misskey` が含まれ、ユーザーへ通知される
