## MODIFIED Requirements

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
- **AND** Bluesky・Threads など他の選択中 SNS への投稿と並行して成功通知が表示される

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

misskey.io のファイルサイズ上限は 500 MB であり、本アプリが扱う画像がこれを超えることはないため、システムは Misskey への投稿で画像の自動リサイズ・形式変換を行ってはならない (SHALL NOT)。

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

システムは、ユーザーがリプライ元選択 UI を展開したとき、Misskey に接続済みであれば、バックエンド経由で `POST https://{host}/api/users/notes` を呼び出して自投稿一覧を取得し、Bluesky・Threads の自投稿と同様にリプライ元候補として表示しなければならない (SHALL)。

対象ユーザーの識別子は、接続時に保管した表示用メタ（`user.id`）から解決しなければならない (SHALL)。リプライ元候補として不適切であるため、システムはリノート（`withRenotes`）を取得対象に含めてはならない (SHALL NOT)。一方、Bluesky（`getAuthorFeed` の既定 `posts_with_replies`）が自分のリプライを候補に含めているため、システムは自分のリプライ（`withReplies`）を取得対象に含めなければならない (SHALL)。これにより、スレッドの 2 通目以降へ連ねる運用と、`PPP-004-reply-selection` のグループ化における他 SNS との候補集合の一致が保たれる。

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
- **THEN** Bluesky・Threads の自投稿候補は従来通り表示される
- **AND** リプライ元選択 UI のローディング表示は解除される

#### Scenario: 画像のみの自投稿を候補に含める（Image-only note appears as candidate）

- **GIVEN** ユーザーが Misskey に接続済みで投稿対象チェックボックスが ON であり、本文を持たない画像のみのノートが存在する
- **WHEN** リプライ元選択 UI を展開する
- **THEN** 画像のみのノートも本文を空文字として候補に表示され、エラーで処理が中断しない
