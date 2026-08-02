## MODIFIED Requirements

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

### Requirement: 公開前のコンテナ処理完了待ち（Wait for container readiness before publish）

Threads のメディアコンテナは Meta 側で非同期に処理されるため、システムは公開（`threads_publish`）を行う前に、対象コンテナの処理状態（`GET /{creation_id}?fields=status`）が `FINISHED` になるまで待機しなければならない (SHALL)。この待機はテキスト・単画像・カルーセルのすべての投稿経路に適用される。コンテナ作成直後に待機なしで公開してはならない (SHALL NOT)（待機なしの公開は `code:24 / subcode:4279009` "Media Not Found" を引き起こすため）。

カルーセル投稿の場合、システムは親コンテナ（`media_type=CAROUSEL`）を作成する前に、すべての子コンテナが `FINISHED` になるまで待機しなければならない (SHALL)。処理が完了していない子コンテナの ID を親コンテナの `children` に指定してはならない (SHALL NOT)（未完了の子を指定すると `code:100 / subcode:4279004` "Invalid Carousel Children" となるため）。

`status` が `ERROR` または `EXPIRED` の場合、システムは公開を行わず、その投稿を失敗として扱わなければならない (SHALL)。子コンテナのいずれか 1 つでも `FINISHED` にならない場合、システムは親コンテナを作成せず、その投稿を失敗として扱わなければならない (SHALL)。

バックエンドの実行時間制約（Netlify 同期 Function の実行時間制限）に収めるため、システムは 1 回の呼び出しに対する実行時間予算を定め、コンテナの完了待ちをその予算内に収めなければならない (SHALL)。予算は子コンテナの待機・トップレベルコンテナの待機・PR ゴースト投稿で共有し、投稿ごとに独立して消費してはならない (SHALL NOT)。予算内に `FINISHED` にならない場合、システムはその投稿を失敗として扱わなければならない (SHALL)。

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
