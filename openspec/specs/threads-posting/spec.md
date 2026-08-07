# threads-posting Specification

## Purpose
Meta OAuth 2.0 + Threads Graph API を用いた Threads アカウント接続・テキスト/画像投稿・長命トークン自動リフレッシュ機能の仕様。
## Requirements
### Requirement: Threads アカウント接続（Connect Threads account via OAuth）

システムは、ユーザーが Threads 接続を要求したとき、`threads_basic,threads_content_publish,threads_manage_replies` を指定した Meta OAuth の認可ページへ、登録済みの `redirect_uri` を用いてリダイレクトしなければならない (SHALL)。認可後にアプリへ戻った際、システムは受け取った認可コードをバックエンド経由で長命アクセストークン（60 日）へ交換し、`credential-custody` capability に従ってサーバー側の保管庫（Cloudflare D1）へ暗号化保存しなければならない (SHALL)。システムは長命トークンをクライアントへ返し `localStorage` に保存してはならない (SHALL NOT)。クライアントへ返してよいのはセッション ID と表示用メタ（`user_id` 等）に限る。システムは `client_secret` をフロントエンドで扱ってはならない (SHALL NOT)。Threads は OOB redirect を許可しないため、システムは認可コードの手動コピー＆ペースト方式を用いてはならない (SHALL NOT)。

#### Scenario: Threads に接続する（Connect to Threads）

- **GIVEN** ユーザーが Threads に未接続である
- **WHEN** 接続ボタンを押下し、Meta の認可ページで許可する
- **THEN** `redirect_uri` でアプリへ戻った後、認可コードがバックエンド経由で長命トークンへ交換される
- **AND** 長命トークンは D1 に暗号化保存され、クライアントにはセッション ID と表示用メタのみが返る
- **AND** Threads が「接続済み」として表示され、投稿対象チェックボックスが有効になる

#### Scenario: Threads を切断する（Disconnect Threads）

- **GIVEN** ユーザーが Threads に接続済みである
- **WHEN** 切断ボタンを押下する
- **THEN** サーバー保管庫から当該セッションの Threads トークンが削除される
- **AND** Threads の投稿対象チェックボックスが無効化される

#### Scenario: 未接続時は投稿対象に選択できない（Cannot select when not connected）

- **GIVEN** ユーザーが Threads に接続していない
- **WHEN** 投稿対象 SNS の選択肢を確認する
- **THEN** Threads のチェックボックスは無効化されている

### Requirement: Threads へのテキスト投稿（Post text to Threads）

システムは、Threads が投稿対象に選択されているとき、入力テキストをバックエンド経由で Threads へ投稿しなければならない (SHALL)。バックエンドは、メディアコンテナ作成（`media_type=TEXT`）と公開（`creation_id` 指定）の 2 段階で投稿を行わなければならない (SHALL)。画像を添付して投稿する場合の振る舞いは `### Requirement: Threads への画像投稿` に、リプライ元が選択されている場合の振る舞いは `### Requirement: Threads へのリプライ投稿` に従う。投稿に失敗した場合、システムは失敗を無言で握りつぶしてはならず (SHALL NOT)、エラー一覧に `Threads` を含めてユーザーへ通知しなければならない (SHALL)。

#### Scenario: テキストを Threads に投稿する（Post text successfully）

- **GIVEN** ユーザーが Threads に接続済みで、投稿対象チェックボックスが ON、本文が入力されている
- **AND** 画像を添付しておらず、リプライ元も選択していない
- **WHEN** 投稿ボタンを押下する
- **THEN** バックエンドがコンテナ作成（`media_type=TEXT`）→ 公開の 2 段階で投稿を完了する
- **AND** Mastodon・Bluesky など他の選択中 SNS への投稿と並行して成功通知が表示される

#### Scenario: 投稿に失敗する（Post fails）

- **GIVEN** ユーザーが Threads を投稿対象に選択している
- **AND** コンテナ作成または公開のいずれかが失敗する状態である
- **WHEN** 投稿ボタンを押下する
- **THEN** エラー一覧に `Threads` が含まれ、ユーザーへ投稿失敗が通知される

### Requirement: 公開前のコンテナ処理完了待ち（Wait for container readiness before publish）

Threads のメディアコンテナは Meta 側で非同期に処理されるため、システムは公開（`threads_publish`）を行う前に、対象コンテナの処理状態（`GET /{creation_id}?fields=status`）が `FINISHED` になるまで待機しなければならない (SHALL)。この待機はテキスト・単画像・カルーセルのすべての投稿経路に適用される。コンテナ作成直後に待機なしで公開してはならない (SHALL NOT)（待機なしの公開は `code:24 / subcode:4279009` "Media Not Found" を引き起こすため）。

カルーセル投稿の場合、システムは親コンテナ（`media_type=CAROUSEL`）を作成する前に、すべての子コンテナが `FINISHED` になるまで待機しなければならない (SHALL)。処理が完了していない子コンテナの ID を親コンテナの `children` に指定してはならない (SHALL NOT)（未完了の子を指定すると `code:100 / subcode:4279004` "Invalid Carousel Children" となるため）。

`status` が `ERROR` または `EXPIRED` の場合、システムは公開を行わず、その投稿を失敗として扱わなければならない (SHALL)。子コンテナのいずれか 1 つでも `FINISHED` にならない場合、システムは親コンテナを作成せず、その投稿を失敗として扱わなければならない (SHALL)。

バックエンドの実行時間制約（Netlify 同期 Function の実行時間制限）に収めるため、システムは 1 回の呼び出しに対する実行時間予算を定め、コンテナの完了待ちをその予算内に収めなければならない (SHALL)。予算は子コンテナの待機・トップレベルコンテナの待機・PR ゴースト投稿で共有し、投稿ごとに独立して消費してはならない (SHALL NOT)。予算内に `FINISHED` にならない場合、システムはその投稿を失敗として扱わなければならない (SHALL)。

コンテナの完了待機後であっても、公開（`threads_publish`）が `code:24 / subcode:4279009` "Media Not Found" で失敗することがある（Meta 側の非同期伝播に起因する既知の問題である）。システムは公開がこのエラーで失敗した場合、実行時間予算が残っている場合に限り、コンテナを作り直してコンテナ作成から公開までのフローを再実行しなければならない (SHALL)。再試行は初回を含めて最大 3 回とする（再試行は最大 2 回）。予算が不足している場合、または再試行を尽くしても失敗した場合、システムはその投稿を失敗として扱わなければならない (SHALL)。再試行は同一 `creation_id` での公開再試行ではなく、新たにコンテナを作成して行わなければならない (SHALL NOT)。`code:24 / subcode:4279009` 以外の公開失敗については再試行してはならない (SHALL NOT)。

#### Scenario: コンテナ処理完了後に公開する（Publish after container becomes FINISHED）

- **GIVEN** ユーザーが Threads を投稿対象に選択し、本文を入力している
- **AND** コンテナ作成は成功したが、作成直後の `status` は `IN_PROGRESS` である
- **WHEN** 投稿ボタンを押下する
- **THEN** バックエンドは `status` を `FINISHED` まで待機してから公開（`threads_publish`）を行い、投稿が成功する

#### Scenario: 子コンテナの完了を待ってから親を作成する（Wait for children before creating carousel）

- **GIVEN** ユーザーが本文と画像 3 枚を入力し、Threads にチェックを入れている
- **AND** 子コンテナ作成直後は一部の子の `status` が `IN_PROGRESS` である
- **WHEN** 投稿ボタンを押下する
- **THEN** すべての子が `FINISHED` になるまで親コンテナは作成されない
- **AND** その後に親コンテナが作成され、公開まで完了する

#### Scenario: コンテナがエラー状態で公開されない（Container in error state is not published）

- **GIVEN** ユーザーが Threads を投稿対象に選択している
- **AND** コンテナの `status` が `ERROR` または `EXPIRED` になる状態である
- **WHEN** 投稿ボタンを押下する
- **THEN** 公開（`threads_publish`）は行われず、Threads 投稿が失敗として扱われる
- **AND** エラー一覧に `Threads` が含まれ、ユーザーへ投稿失敗が通知される

#### Scenario: 実行時間予算内に完了しない（Not ready within the time budget）

- **GIVEN** ユーザーが Threads を投稿対象に選択している
- **AND** コンテナの処理が実行時間予算内に `FINISHED` にならない状態である
- **WHEN** 投稿ボタンを押下する
- **THEN** バックエンドは待機を打ち切り、公開を行わずに Threads 投稿を失敗として扱う
- **AND** エラー一覧に `Threads` が含まれ、ユーザーへ投稿失敗が通知される

#### Scenario: 公開が一時エラーで失敗し、コンテナ再作成で成功する（Publish fails transiently and succeeds after recreating container）

- **GIVEN** ユーザーが Threads を投稿対象に選択し、本文を入力している
- **AND** コンテナは `FINISHED` まで待機済みである
- **AND** 公開（`threads_publish`）が `code:24 / subcode:4279009` "Media Not Found" で失敗する状態である
- **WHEN** 投稿ボタンを押下する
- **THEN** バックエンドはコンテナを作り直し、コンテナ作成から公開までのフローを再実行する
- **AND** 再試行で公開が成功し、投稿が成功する

#### Scenario: 再試行を尽くしても失敗する（Fails after exhausting retries）

- **GIVEN** ユーザーが Threads を投稿対象に選択している
- **AND** 公開（`threads_publish`）が `code:24 / subcode:4279009` "Media Not Found" で失敗し続ける状態である
- **WHEN** 投稿ボタンを押下する
- **THEN** バックエンドは初回を含めて最大 3 回までコンテナを作り直して再試行する
- **AND** すべての試行が失敗した場合、Threads 投稿は失敗として扱われる
- **AND** エラー一覧に `Threads` が含まれ、ユーザーへ投稿失敗が通知される

### Requirement: Threads 本文の文字数上限（Threads text length limit）

システムは、Threads 本文が 500 文字を超える場合、Threads への投稿を失敗として扱い、ユーザーに通知しなければならない (SHALL)。MVP では Threads 専用の文字数カウンタ表示を設けず、上限超過は Threads API のエラー応答を介して投稿失敗として扱ってよい。

#### Scenario: 500 文字を超える本文（Text exceeds 500 characters）

- **GIVEN** Threads が投稿対象に選択されている
- **AND** 本文が 500 文字を超えている
- **WHEN** 投稿ボタンを押下する
- **THEN** Threads への投稿が失敗する
- **AND** エラー一覧に `Threads` が含まれ、ユーザーへ通知される

### Requirement: Threads への画像投稿（Post images to Threads）

システムは、ユーザーが画像を添付して Threads 投稿を実行したとき、Cloudflare R2 に一時保存された公開 URL を用いて Threads API に画像付き投稿を行わなければならない (SHALL)。

画像が 1 枚の場合は `media_type=IMAGE` で単画像コンテナを作成し、2 枚以上の場合は各画像を `media_type=IMAGE` の子コンテナとして作成したうえで `media_type=CAROUSEL` の親コンテナにまとめなければならない (SHALL)。Threads API のカルーセル上限に合わせ、添付画像は最大 10 枚まで対応しなければならない (SHALL)。

2 枚以上の場合、システムは各子コンテナの作成時に `is_carousel_item=true` を付与しなければならない (SHALL)。このパラメータを付与せずに作成したコンテナを親コンテナの `children` に指定してはならない (SHALL NOT)。付与しない場合、子は通常の単画像コンテナとして作成され、親コンテナ作成が `code:100 / subcode:4279004` "Invalid Carousel Children" で失敗するためである。

添付画像が 11 枚以上の場合、システムは Threads への投稿を試行してはならず (SHALL NOT)、Threads への投稿を失敗として扱い、エラー一覧に `Threads` を含めてユーザーへ通知しなければならない (SHALL)。

バックエンドは `images` 配列が空または未指定の場合、PPP-009 のテキスト投稿フロー（`### Requirement: Threads へのテキスト投稿`）で処理しなければならない (SHALL)。

#### Scenario: 単画像投稿（Single image post）

- **GIVEN** ユーザーが本文と画像 1 枚を入力し、Threads にチェックを入れている
- **WHEN** 投稿ボタンを押す
- **THEN** `media_type=IMAGE` のコンテナが作成され、公開後に Threads タイムラインに画像付き投稿が表示される

#### Scenario: 複数画像投稿（Multiple images post）

- **GIVEN** ユーザーが本文と画像 3 枚を入力し、Threads にチェックを入れている
- **WHEN** 投稿ボタンを押す
- **THEN** 3 枚の `media_type=IMAGE` 子コンテナが `is_carousel_item=true` 付きで作成される
- **AND** 1 つの `media_type=CAROUSEL` 親コンテナにまとめられ、公開後にカルーセル投稿が表示される

#### Scenario: テキストのみ投稿（Text only post）

- **GIVEN** ユーザーが本文のみ入力し（画像なし）、Threads にチェックを入れている
- **WHEN** 投稿ボタンを押す
- **THEN** PPP-009 のテキスト投稿フロー（`media_type=TEXT`）で処理され、テキストのみ投稿が完了する

#### Scenario: 上限を超える枚数の添付（Exceeds maximum image count）

- **GIVEN** ユーザーが本文と画像 11 枚を入力し、Threads にチェックを入れている
- **WHEN** 投稿ボタンを押す
- **THEN** Threads への投稿は試行されず、失敗として扱われる
- **AND** エラー一覧に `Threads` が含まれ、ユーザーへ投稿失敗が通知される

### Requirement: Threads 画像投稿失敗時のエラー通知（Image post failure notification）

システムは、画像付き Threads 投稿の多段フロー（子コンテナ作成・親コンテナ作成・公開）のいずれかが失敗した場合、失敗を無言で握りつぶしてはならず (SHALL NOT)、エラー一覧に `Threads` を含めてユーザーへ通知しなければならない (SHALL)。複数画像投稿時、子コンテナのいずれか 1 つでも作成に失敗した場合、システムはその投稿全体を失敗として扱わなければならない (SHALL)。

#### Scenario: 子コンテナ作成失敗（Child container creation fails）

- **GIVEN** ユーザーが本文と画像 3 枚を入力し、Threads にチェックを入れている
- **AND** 3 枚のうち 1 枚の子コンテナ作成（`media_type=IMAGE`）が失敗する状態である
- **WHEN** 投稿ボタンを押す
- **THEN** 親コンテナ作成・公開は行われず、Threads 投稿が失敗として扱われる
- **AND** エラー一覧に `Threads` が含まれ、ユーザーへ投稿失敗が通知される

#### Scenario: 公開失敗（Publish fails）

- **GIVEN** ユーザーが本文と画像 1 枚を入力し、Threads にチェックを入れている
- **AND** コンテナ作成は成功するが公開（`threads_publish`）が失敗する状態である
- **WHEN** 投稿ボタンを押す
- **THEN** Threads 投稿が失敗として扱われる
- **AND** エラー一覧に `Threads` が含まれ、ユーザーへ投稿失敗が通知される

### Requirement: Threads 長命トークンの自動リフレッシュ（Auto-refresh long-lived token）

システムは、Threads の長命トークンが取得（または最終更新）から 24 時間以上経過している場合、バックエンド経由で Threads API（`grant_type=th_refresh_token`）を呼び出してトークンをリフレッシュしなければならない (SHALL)。システムはリフレッシュ可否の判定とリフレッシュ実行をサーバー側で行い、保管庫（D1）の該当トークンと更新時刻を更新しなければならない (SHALL)。Threads API の制約により、システムは取得から 24 時間未満のトークンをリフレッシュしてはならない (SHALL NOT)。システムはリフレッシュ後の新トークンをクライアントへ返してはならない (SHALL NOT)。リフレッシュに失敗した場合、システムは既存の保管トークンと接続状態を維持しなければならず (SHALL)、保管済みトークンを削除してはならない (SHALL NOT)。失効済みトークンによる投稿失敗は、既存のエラー通知要件（エラー一覧に `Threads` を含めて通知）で処理する。

#### Scenario: 24 時間経過後にサーバーがトークンを更新する（Server refreshes after 24 hours）

- **GIVEN** ユーザーが Threads に接続済みで、保管トークンの最終更新から 24 時間以上経過している
- **WHEN** リフレッシュ判定の契機（アプリ起動時のサーバー問い合わせ、または次の投稿時）が発生する
- **THEN** バックエンドが Threads API のリフレッシュを呼び出す
- **AND** 新しいトークンと更新時刻が D1 に保存される（クライアントにはトークンは返らない）

#### Scenario: 24 時間未満ではリフレッシュしない（No refresh within 24 hours）

- **GIVEN** 保管トークンの最終更新から 24 時間未満である
- **WHEN** リフレッシュ判定が行われる
- **THEN** リフレッシュ API は呼び出されず、保管トークンは変更されない

#### Scenario: リフレッシュ失敗時も接続状態を維持する（Keep connection on refresh failure）

- **GIVEN** 24 時間以上経過しているが、リフレッシュ API が失敗する状態である
- **WHEN** リフレッシュを試行する
- **THEN** 既存の保管トークンは維持され、削除されない
- **AND** Threads は「接続済み」のまま表示される

### Requirement: Threads の自投稿取得（Fetch own Threads posts）

システムは、ユーザーがリプライ元選択 UI を展開したとき、Threads に接続済みであれば、バックエンド経由で Threads API（`GET /me/threads`、`fields=id,text,permalink,timestamp`）を呼び出して自投稿一覧を取得し、Mastodon・Bluesky の自投稿と同様にリプライ元候補として表示しなければならない (SHALL)。

取得した各投稿について、システムは Threads API の投稿 `id` を保持しなければならない (SHALL)。permalink の末尾はショートコードであり API の投稿 ID ではないため、permalink から ID を導出してはならない (SHALL NOT)。

画像のみの投稿は Threads API が `text` フィールドを返さないため、システムは本文を空文字として扱わなければならず (SHALL)、`text` が欠落した投稿を候補から除外したり、処理を中断したりしてはならない (SHALL NOT)。

Threads の自投稿取得に失敗した場合でも、システムは Mastodon・Bluesky の自投稿候補の表示を妨げてはならない (SHALL NOT)。また、取得の成否にかかわらず、リプライ元選択 UI がローディング表示のまま固定されてはならない (SHALL NOT)。

#### Scenario: 接続済みで自投稿が候補に表示される（Own posts appear as reply candidates）

- **GIVEN** ユーザーが Threads に接続済みで、Threads に投稿が存在する
- **WHEN** リプライ元選択 UI を展開する
- **THEN** Threads の自投稿がリプライ元候補のドロップダウンに表示される

#### Scenario: 未接続時は取得しない（No fetch when not connected）

- **GIVEN** ユーザーが Threads に接続していない
- **WHEN** リプライ元選択 UI を展開する
- **THEN** Threads の自投稿取得 API は呼び出されない
- **AND** Mastodon・Bluesky の自投稿候補は従来通り表示される

#### Scenario: Threads の取得失敗は他 SNS に影響しない（Fetch failure does not block other SNS）

- **GIVEN** ユーザーが Threads に接続済みだが、Threads の自投稿取得が失敗する状態である
- **WHEN** リプライ元選択 UI を展開する
- **THEN** Mastodon・Bluesky の自投稿候補は従来通り表示される
- **AND** リプライ元選択 UI のローディング表示は解除される

#### Scenario: 画像のみの自投稿を候補に含める（Image-only post appears as candidate）

- **GIVEN** ユーザーが Threads に接続済みで、本文を持たない画像のみの投稿が存在する
- **WHEN** リプライ元選択 UI を展開する
- **THEN** 画像のみの投稿も本文を空文字として候補に表示され、エラーで処理が中断しない

### Requirement: Threads へのリプライ投稿（Post reply to Threads）

システムは、リプライ元として Threads の自投稿が選択されているとき、コンテナ作成（`POST /me/threads`）に `reply_to_id`（自投稿取得 API で得た投稿 `id`）を指定して、リプライとして投稿しなければならない (SHALL)。画像付きの場合も同様に、トップレベルのコンテナ（カルーセルの場合は親コンテナ）に `reply_to_id` を付与しなければならない (SHALL)。

リプライ作成には Threads API の `threads_manage_replies` スコープが必要である。通常投稿に必要な `threads_content_publish` だけでは `reply_to_id` 付きコンテナ作成が権限エラー（`code: 10` "Application does not have permission"）となるため、システムは認可時に `threads_basic,threads_content_publish,threads_manage_replies` を要求しなければならない (SHALL)。

リプライ元が選択されていない場合、または選択されたリプライ元グループに Threads の投稿が含まれない場合、システムは `reply_to_id` を付与せず通常投稿として処理しなければならない (SHALL)。

リプライ投稿に失敗した場合、システムはエラー一覧に `Threads` を含めてユーザーへ通知しなければならない (SHALL)。

#### Scenario: 自投稿を選択してリプライする（Reply to own post）

- **GIVEN** ユーザーが Threads に接続済みで、リプライ元として Threads の自投稿を選択し、本文を入力している
- **WHEN** 投稿ボタンを押下する
- **THEN** コンテナ作成に `reply_to_id` が付与され、選択した自投稿へのリプライとして公開される

#### Scenario: 画像付きでリプライする（Reply with images）

- **GIVEN** ユーザーがリプライ元として Threads の自投稿を選択し、本文と画像を入力している
- **WHEN** 投稿ボタンを押下する
- **THEN** 画像投稿要件に従ったコンテナ（単画像またはカルーセル親）に `reply_to_id` が付与され、リプライとして公開される

#### Scenario: リプライ元未選択時は通常投稿（Normal post without reply selection）

- **GIVEN** ユーザーが Threads を投稿対象に選択し、リプライ元を選択していない
- **WHEN** 投稿ボタンを押下する
- **THEN** `reply_to_id` なしの通常投稿として公開される

#### Scenario: リプライ失敗時の通知（Reply failure notification）

- **GIVEN** ユーザーがリプライ元として Threads の自投稿を選択している
- **AND** リプライ投稿が失敗する状態である（権限不足・元投稿の削除など）
- **WHEN** 投稿ボタンを押下する
- **THEN** エラー一覧に `Threads` が含まれ、ユーザーへ投稿失敗が通知される

### Requirement: Threads ゴースト投稿のバックエンド対応（Backend support for ghost posts）

システムは、`threads_post` バックエンドが `is_ghost_post`（任意の真偽値）を受け取り、`true` の場合にコンテナ作成のパラメータへ `is_ghost_post=true` を付与して、24 時間で自動アーカイブされるゴースト投稿として公開できるようにしなければならない (SHALL)。

ゴースト投稿は Threads API の制約によりテキストのみであるため、`is_ghost_post=true` のとき、システムは添付画像を無視し `media_type=TEXT` のコンテナを作成しなければならない (SHALL)。`is_ghost_post` が未指定または `false` の場合、システムは従来の投稿フロー（テキスト・単画像・カルーセル）を変更してはならない (SHALL NOT)。

公開前のコンテナ処理完了待ち（`### Requirement: 公開前のコンテナ処理完了待ち`）は、ゴースト投稿にも同様に適用される。ゴースト投稿の公開に失敗した場合、システムは失敗を呼び出し元へ返さなければならない (SHALL)。

#### Scenario: ゴースト投稿としてテキストを公開する（Publish text as ghost post）

- **GIVEN** バックエンドが `is_ghost_post=true` とテキストを含むリクエストを受け取る
- **WHEN** Threads へ投稿する
- **THEN** `media_type=TEXT` のコンテナが `is_ghost_post=true` 付きで作成され、完了待機後に公開される
- **AND** 公開された投稿は 24 時間で自動アーカイブされるゴースト投稿となる

#### Scenario: ゴースト投稿時は画像を無視する（Images ignored for ghost post）

- **GIVEN** バックエンドが `is_ghost_post=true` と画像 URL を含むリクエストを受け取る
- **WHEN** Threads へ投稿する
- **THEN** 画像は付与されず、テキストのみのゴースト投稿として公開される

#### Scenario: 通常投稿は影響を受けない（Normal post unaffected）

- **GIVEN** バックエンドが `is_ghost_post` 未指定（または `false`）のリクエストを受け取る
- **WHEN** Threads へ投稿する
- **THEN** 従来のテキスト・単画像・カルーセル投稿フローがそのまま実行される

### Requirement: PR ゴースト投稿設定の管理（Manage PR ghost post settings）

システムは、ユーザーが PR ゴースト投稿の設定（有効/無効・付与間隔（時間、既定 48）・PR 文の一覧）を編集でき、これをサーバー側（Cloudflare D1）に **Threads アカウント（`user_id`）単位**で保存しなければならない (SHALL)。システムは実行状態（前回 PR を出した時刻・次に使う PR 文の位置）も同様に Threads アカウント単位で D1 に保持しなければならない (SHALL)。設定・状態の読み書きは、セッションに保管された Threads トークンのメタ情報から `user_id` を解決して行い、セッションに Threads トークンが保管されていない場合は失敗としなければならない (SHALL)。セッション ID をキーとして保存してはならない (SHALL NOT)（セッションはブラウザ単位のため、端末をまたいだ間隔管理の一貫性が失われる）。システムは PR 設定・状態・トークンを `localStorage` に保存してはならない (SHALL NOT)。システムは PR ゴースト投稿の設定 UI を Threads に接続済みのときのみ表示し (SHALL)、未接続時は表示してはならない (SHALL NOT)。各 PR 文はゴースト投稿の制約に従い 500 文字以内とし、システムは上限超過をユーザーに知らせなければならない (SHALL)。

#### Scenario: PR 設定をサーバーに保存する（Save PR settings server-side）

- **GIVEN** ユーザーが Threads に接続済みである
- **WHEN** PR ゴースト投稿を有効にし、間隔と PR 文を入力する
- **THEN** 設定が Threads アカウント（`user_id`）に紐づけて D1 に保存される（`localStorage` には保存されない）

#### Scenario: 未接続時は設定 UI を表示しない（No settings UI when not connected）

- **GIVEN** ユーザーが Threads に接続していない
- **WHEN** Threads の設定欄を開く
- **THEN** PR ゴースト投稿の設定 UI は表示されない

### Requirement: PR ゴースト投稿の自動付与（Auto-append PR ghost post）

システムは、本投稿が成功し、かつ「投稿対象に Threads が含まれ Threads 本投稿が成功」「PR 設定が有効で PR 文が 1 つ以上」「前回 PR を出した時刻からの経過が設定間隔以上（D1 に実行状態が未作成、または前回 PR を出した時刻が未設定＝未投稿の場合は経過済みとみなす）」のすべてを満たすときに限り、PR 文を 1 つ選んでゴースト投稿として自動追加投稿しなければならない (SHALL)。システムは間隔判定をサーバー側（D1 の実行状態）で行わなければならず (SHALL)、クライアントが送る値で判定してはならない (SHALL NOT)。これにより `localStorage` 改変などクライアント側の操作で間隔ゲートを回避できないようにする。実行状態は Threads アカウント（`user_id`）単位で管理し、異なるセッション（別ブラウザ・別端末）からの投稿であっても、同一の Threads アカウントに対しては単一の間隔ゲートとローテーションを共有しなければならない (SHALL)。システムは PR 文を登録順にローテーションして選択しなければならない (SHALL)。PR ゴースト投稿が成功したときのみ、システムは D1 の実行状態（前回時刻・ローテーション位置）を更新しなければならない (SHALL)。PR ゴースト投稿が成功に至らなかったすべての場合、システムは状態を更新してはならない (SHALL NOT)。システムは PR ゴースト投稿の失敗を本投稿の成否へ影響させてはならず (SHALL NOT)、本投稿の成功通知やエラー一覧に PR の失敗を含めてはならない (SHALL NOT)。

本投稿が完了した時点で呼び出し全体の実行時間予算が残り少ない場合、システムは PR ゴースト投稿を試行してはならない (SHALL NOT)。これは PR ゴースト投稿の実行によって本投稿の応答がバックエンドの実行時間制限を超えることを防ぐためである。この場合も実行状態を更新してはならず (SHALL NOT)、次回の本投稿で再試行されなければならない (SHALL)。

#### Scenario: サーバー判定で間隔経過後に PR が付与される（Server judges interval, PR appended）

- **GIVEN** Threads を投稿対象に選択し、PR 設定が有効で PR 文が登録されている
- **AND** サーバー保管の実行状態で前回 PR から設定間隔以上が経過している
- **WHEN** 本投稿が成功する
- **THEN** サーバー判定により PR 文が 1 つ選ばれ、直後に独立したゴースト投稿として公開される
- **AND** D1 の実行状態（前回時刻・ローテーション位置）が更新される

#### Scenario: 間隔内では PR が付与されない（No PR within interval）

- **GIVEN** PR 設定が有効だが、サーバー保管の実行状態で前回 PR から設定間隔が経過していない
- **WHEN** 本投稿が成功する
- **THEN** PR ゴースト投稿は行われない

#### Scenario: クライアント改変で間隔ゲートを回避できない（Client tampering cannot bypass gate）

- **GIVEN** 前回 PR から設定間隔が経過していない
- **AND** クライアント側の値が経過済みであるかのように改変されている
- **WHEN** 本投稿が成功する
- **THEN** サーバーが自身の保管状態で判定するため、PR ゴースト投稿は行われない

#### Scenario: 別セッションでも同一アカウントならゲートを共有する（Gate shared across sessions for same account）

- **GIVEN** 同一の Threads アカウントが 2 つのセッション（別ブラウザ）から接続されている
- **AND** 一方のセッションからの投稿で PR ゴースト投稿が行われ、設定間隔が経過していない
- **WHEN** もう一方のセッションから本投稿が成功する
- **THEN** 間隔ゲートは Threads アカウント単位で共有されているため、PR ゴースト投稿は行われない

#### Scenario: 実行状態が未作成/未投稿の初回は PR が付与される（First run with no prior state appends PR）

- **GIVEN** Threads を投稿対象に選択し、PR 設定が有効で PR 文が登録されている
- **AND** D1 に当該セッションの実行状態が未作成、または前回 PR を出した時刻が未設定（未投稿）である
- **WHEN** 本投稿が成功する
- **THEN** 経過済みとみなされ、PR 文が 1 つ選ばれてゴースト投稿として公開される
- **AND** D1 の実行状態（前回時刻・ローテーション位置）が新規作成または更新される

#### Scenario: Threads 本投稿が失敗したら付与しない（No PR when Threads post failed）

- **GIVEN** PR 設定が有効で間隔も経過しているが、Threads への本投稿が失敗する状態である
- **WHEN** 投稿ボタンを押下する
- **THEN** サーバーは PR ゴースト投稿を行わず、D1 の実行状態も更新しない

#### Scenario: 実行時間予算が残っていなければ付与しない（No PR when time budget is exhausted）

- **GIVEN** PR 設定が有効で間隔も経過しているが、画像 3 枚のカルーセル投稿などで本投稿が実行時間予算の大半を消費している
- **WHEN** 本投稿が成功する
- **THEN** PR ゴースト投稿は試行されず、D1 の実行状態も更新されない
- **AND** 本投稿は成功として通知される

#### Scenario: PR 投稿失敗は本投稿に影響しない（PR failure does not affect main post）

- **GIVEN** 本投稿は成功したが、PR ゴースト投稿が失敗する状態である
- **WHEN** 投稿処理が完了する
- **THEN** 本投稿は成功として通知され、エラー一覧に PR の失敗は含まれない
- **AND** サーバーは D1 の実行状態を更新せず、次回の本投稿で再試行される

### Requirement: Threads への引用投稿（Post quote to Threads）

システムは、引用元として Threads の自投稿が選択されているとき、コンテナ作成（`POST /me/threads`）に `quote_post_id`（自投稿取得 API で得た投稿 `id`）を指定して、引用として投稿しなければならない (SHALL)。画像付きの場合も同様に、トップレベルのコンテナ（カルーセルの場合は親コンテナ）に `quote_post_id` を付与しなければならない (SHALL)。カルーセルの子コンテナには付与してはならない (SHALL NOT)。

引用元が選択されていない場合、または選択された引用元グループに Threads の投稿が含まれない場合、システムは `quote_post_id` を付与せず通常投稿として処理しなければならない (SHALL)。

引用投稿に失敗した場合、システムはエラー一覧に `Threads` を含めてユーザーへ通知しなければならない (SHALL)。

#### Scenario: 自投稿を選択して引用する（Quote own post）

- **GIVEN** ユーザーが Threads に接続済みで、引用元として Threads の自投稿を選択し、本文を入力している
- **WHEN** 投稿ボタンを押下する
- **THEN** コンテナ作成に `quote_post_id` が付与され、選択した自投稿の引用として公開される

#### Scenario: 画像付きで引用する（Quote with images）

- **GIVEN** ユーザーが引用元として Threads の自投稿を選択し、本文と画像を入力している
- **WHEN** 投稿ボタンを押下する
- **THEN** 画像投稿要件に従ったコンテナ（単画像またはカルーセル親）に `quote_post_id` が付与され、引用として公開される

#### Scenario: 引用元未選択時は通常投稿（Normal post without quote）

- **GIVEN** ユーザーが Threads を投稿対象に選択し、引用元を選択していない
- **WHEN** 投稿ボタンを押下する
- **THEN** `quote_post_id` なしの通常投稿として公開される

#### Scenario: 引用失敗時の通知（Quote failure notification）

- **GIVEN** ユーザーが引用元として Threads の自投稿を選択している
- **AND** 引用投稿が失敗する状態である（元投稿の削除・権限不足など）
- **WHEN** 投稿ボタンを押下する
- **THEN** エラー一覧に `Threads` が含まれ、ユーザーへ投稿失敗が通知される

## Related Changes

- [2026-06-04-PPP-009-add-threads-posting](../../changes/archive/2026-06-04-PPP-009-add-threads-posting/proposal.md)
- [2026-06-12-PPP-010-add-threads-image-posting](../../changes/archive/2026-06-12-PPP-010-add-threads-image-posting/proposal.md)
- [2026-06-12-PPP-011-add-threads-token-refresh](../../changes/archive/2026-06-12-PPP-011-add-threads-token-refresh/proposal.md)
- [2026-06-28-PPP-012-add-threads-reply](../../changes/archive/2026-06-28-PPP-012-add-threads-reply/proposal.md)
- [2026-06-29-PPP-013-add-threads-pr-ghost-post](../../changes/archive/2026-06-29-PPP-013-add-threads-pr-ghost-post/proposal.md)

- [2026-07-06-PPP-014-server-side-token-custody](../../changes/archive/2026-07-06-PPP-014-server-side-token-custody/proposal.md)
- [2026-08-04-PPP-028-fix-threads-carousel-children](../../changes/archive/2026-08-04-PPP-028-fix-threads-carousel-children/proposal.md)
- [2026-08-04-PPP-032_add-quote-posting](../../changes/archive/2026-08-04-PPP-032_add-quote-posting/proposal.md)
- [2026-08-07-PPP-035_add-threads-publish-retry](../../changes/archive/2026-08-07-PPP-035_add-threads-publish-retry/proposal.md)
