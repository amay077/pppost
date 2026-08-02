## MODIFIED Requirements

<!-- 本デルタは PPP-028-fix-threads-carousel-children 適用後の本文（子コンテナの完了待ち・実行時間予算を含む）をベースにしている。 -->

### Requirement: 公開前のコンテナ処理完了待ち（Wait for container readiness before publish）

Threads のメディアコンテナは Meta 側で非同期に処理されるため、システムは公開（`threads_publish`）を行う前に、対象コンテナの処理状態（`GET /{creation_id}?fields=status`）が `FINISHED` になるまで待機しなければならない (SHALL)。この待機はテキスト・単画像・カルーセルのすべての投稿経路に適用される。コンテナ作成直後に待機なしで公開してはならない (SHALL NOT)（待機なしの公開は `code:24 / subcode:4279009` "Media Not Found" を引き起こすため）。

カルーセル投稿の場合、システムは親コンテナ（`media_type=CAROUSEL`）を作成する前に、すべての子コンテナが `FINISHED` になるまで待機しなければならない (SHALL)。処理が完了していない子コンテナの ID を親コンテナの `children` に指定してはならない (SHALL NOT)（未完了の子を指定すると `code:100 / subcode:4279004` "Invalid Carousel Children" となるため）。

`status` が `ERROR` または `EXPIRED` の場合、システムは公開を行わず、その投稿を失敗として扱わなければならない (SHALL)。子コンテナのいずれか 1 つでも `FINISHED` にならない場合、システムは親コンテナを作成せず、その投稿を失敗として扱わなければならない (SHALL)。

バックエンドの実行基盤が課す実行時間の制約に収まるよう、システムは 1 回の呼び出しに対する実行時間予算を定め、コンテナの完了待ちをその予算内に収めなければならない (SHALL)。ポーリングの間隔と回数は有限に制限しなければならない (SHALL)。予算は子コンテナの待機・トップレベルコンテナの待機・PR ゴースト投稿で共有し、投稿ごとに独立して消費してはならない (SHALL NOT)。予算内に `FINISHED` にならない場合、システムはその投稿を失敗として扱わなければならない (SHALL)。予算の値は実行基盤の制約（壁時計上限、CPU 時間上限、エッジの応答開始タイムアウト等）から導き、実行基盤に依存しない仕様として特定のホスティングサービス名や秒数を固定してはならない (SHALL NOT)。

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
