# video-posting Specification

## Purpose
Bluesky・Threads・Misskey への動画投稿の仕様。動画の選択・上限チェック・R2 への一時アップロード・各 SNS への投稿・共有シートからの動画共有を定める。

## Requirements
### Requirement: 動画の選択とプレビュー（Select and preview video）

システムは、ユーザーが投稿画面で動画ファイル（`video/mp4` を想定）を選択できる UI を提供しなければならない (SHALL)。選択した動画は `<video>` 要素でプレビュー表示しなければならない (SHALL)。選択可能な動画は 1 本のみとし、動画を添付した状態では画像を追加できず (SHALL NOT)、画像が添付された状態では動画を追加できないものとする (SHALL NOT)。動画を削除して取り除くことはできるものとする (SHALL)。

#### Scenario: 動画を選択してプレビューする（Select a video and preview it）

- **GIVEN** ユーザーが投稿画面で動画ファイルを選択する
- **WHEN** 動画ファイルの選択が完了する
- **THEN** 選択された動画が `<video>` 要素でプレビュー表示される
- **AND** 投稿時にその動画が添付される

#### Scenario: 動画と画像の併用はできない（Cannot mix video and images）

- **GIVEN** ユーザーが動画を添付済みである
- **WHEN** 画像を追加しようとする
- **THEN** 画像の追加は受け付けられない

- **GIVEN** ユーザーが画像を添付済みである
- **WHEN** 動画を追加しようとする
- **THEN** 動画の追加は受け付けられない

#### Scenario: 動画を削除する（Remove the video）

- **GIVEN** ユーザーが動画を添付済みである
- **WHEN** 動画の削除操作を行う
- **THEN** 動画が添付から取り除かれ、プレビューが消える

### Requirement: 動画の許容上限チェック（Validate video size and duration）

システムは、選択された動画が 100MB を超える場合、または再生時間が 5 分（300 秒）を超える場合、その動画を添付として受け付けず、ユーザーにエラーを通知しなければならない (SHALL)。この上限チェックは動画の選択時（アップロード前）に行わなければならない (SHALL)。再生時間の取得ができない場合（メタデータ読み取り失敗など）、システムは動画を添付として受け付けてはならず (SHALL NOT)、ユーザーにエラーを通知しなければならない (SHALL)。

#### Scenario: 上限を超えるサイズの動画（Video exceeds 100MB）

- **GIVEN** ユーザーが 100MB を超える動画ファイルを選択する
- **WHEN** 動画の選択が完了する
- **THEN** 動画は添付されず、サイズ上限超過のエラーがユーザーに通知される

#### Scenario: 上限を超える再生時間の動画（Video exceeds 5 minutes）

- **GIVEN** ユーザーが再生時間 5 分を超える動画ファイルを選択する
- **WHEN** 動画の選択が完了する
- **THEN** 動画は添付されず、再生時間上限超過のエラーがユーザーに通知される

#### Scenario: 再生時間を取得できない動画（Video metadata cannot be read）

- **GIVEN** ユーザーが再生時間を取得できない動画ファイルを選択する
- **WHEN** 動画の選択が完了する
- **THEN** 動画は添付されず、動画を読み込めない旨のエラーがユーザーに通知される

### Requirement: 動画の一時アップロードと削除（Upload video to temporary storage）

システムは、動画を R2 の一時ストレージへアップロードするために、バックエンドの署名付き URL 発行 API（`r2_presigned_url`）を利用しなければならない (SHALL)。動画の Content-Type は拡張子から解決し、署名付き URL 生成時の Content-Type と PUT 時の Content-Type を一致させなければならない (SHALL)。動画オブジェクトは `pppost/video/` プレフィックス配下に保存しなければならない (SHALL)。動画アップロードは base64 化を介さず、File/Blob のまま直接 PUT しなければならない (SHALL NOT)。アップロード済み動画の削除は、R2 バケットのライフサイクルルールによる自動削除に依存し、投稿完了後の明示的な削除 API 呼び出しは行わないものとする (SHALL NOT)。

#### Scenario: 動画を R2 へアップロードする（Upload video to R2）

- **GIVEN** ユーザーが許容上限内の動画を添付して投稿を実行する
- **WHEN** 投稿処理が動画のアップロード段階に到達する
- **THEN** バックエンドが発行した署名付き URL へ動画が File/Blob のまま直接 PUT される
- **AND** 動画の公開 URL が返され、各 SNS への投稿処理に使用される

#### Scenario: 動画はライフサイクルルールで自動削除される（Video is deleted by lifecycle rule）

- **GIVEN** 動画が `pppost/video/` プレフィックス配下にアップロードされた
- **WHEN** バケットのライフサイクルルールで定められた期間が経過する
- **THEN** 動画オブジェクトが自動削除される

### Requirement: Bluesky への動画投稿（Post video to Bluesky）

システムは、Bluesky が投稿対象に選択され、動画が添付されているとき、バックエンドが `app.bsky.video.uploadVideo` で動画をアップロードし、`app.bsky.video.getJobStatus` で処理の完了（`JOB_STATE_COMPLETED`）を待ち、投稿レコードの `embed` に `app.bsky.embed.video`（アップロード結果の blob と alt テキスト）を指定して投稿しなければならない (SHALL)。動画処理ジョブが失敗（`JOB_STATE_FAILED`）した場合、システムは投稿を行わず、その投稿を失敗として扱い、エラー一覧に `Bluesky` を含めてユーザーへ通知しなければならない (SHALL)。処理完了待ちはバックエンドの実行時間制約に収まるよう有限に制限しなければならない (SHALL)。動画が添付されている場合、システムは画像の埋め込み（`app.bsky.embed.images`）や OGP カード（`app.bsky.embed.external`）を動画と同時に指定してはならない (SHALL NOT)。

#### Scenario: 動画を Bluesky に投稿する（Post video to Bluesky successfully）

- **GIVEN** ユーザーが Bluesky を投稿対象に選択し、本文と動画を入力している
- **WHEN** 投稿ボタンを押下する
- **THEN** バックエンドが動画を `app.bsky.video.uploadVideo` でアップロードする
- **AND** ジョブが `JOB_STATE_COMPLETED` になるまで待機したのち、`app.bsky.embed.video` を `embed` に指定して投稿が完了する

#### Scenario: 動画処理ジョブが失敗する（Video job fails）

- **GIVEN** ユーザーが Bluesky を投稿対象に選択し、動画を添付している
- **AND** 動画処理ジョブが `JOB_STATE_FAILED` になる状態である
- **WHEN** 投稿ボタンを押下する
- **THEN** 投稿は行われず、Bluesky 投稿が失敗として扱われる
- **AND** エラー一覧に `Bluesky` が含まれ、ユーザーへ投稿失敗が通知される

#### Scenario: 動画投稿時は画像や OGP を併用しない（Video posts do not include images or OGP）

- **GIVEN** ユーザーが Bluesky を投稿対象に選択し、動画と本文を入力している
- **WHEN** 投稿ボタンを押下する
- **THEN** 本文中に URL が含まれていても OGP カードは埋め込まれない
- **AND** 動画のみが `app.bsky.embed.video` として埋め込まれる

### Requirement: Threads への動画投稿（Post video to Threads）

システムは、Threads が投稿対象に選択され、動画が添付されているとき、バックエンドが R2 の動画公開 URL を `video_url` に指定した `media_type=VIDEO` のメディアコンテナを作成し、コンテナの処理完了（`FINISHED`）を待ってから公開しなければならない (SHALL)。動画投稿のコンテナ完了待ち・公開リトライは、画像投稿と同一のフロー（既存の実行時間予算・`code:24 / subcode:4279009` のコンテナ再作成リトライを含む）に従わなければならない (SHALL)。動画が添付されている場合、システムは画像のカルーセルとして投稿してはならない (SHALL NOT)。

#### Scenario: 動画を Threads に投稿する（Post video to Threads successfully）

- **GIVEN** ユーザーが Threads を投稿対象に選択し、本文と動画を入力している
- **WHEN** 投稿ボタンを押下する
- **THEN** `media_type=VIDEO` のコンテナが `video_url`（R2 の動画公開 URL）付きで作成される
- **AND** コンテナが `FINISHED` になるまで待機したのちに公開され、投稿が成功する

#### Scenario: 動画コンテナの公開が一時エラーで失敗し、再作成で成功する（Video publish retries after transient failure）

- **GIVEN** ユーザーが Threads を投稿対象に選択し、動画を添付している
- **AND** 公開（`threads_publish`）が `code:24 / subcode:4279009` "Media Not Found" で失敗する状態である
- **WHEN** 投稿ボタンを押下する
- **THEN** バックエンドは実行時間予算が残る範囲でコンテナを作り直して再試行する
- **AND** 再試行で公開が成功し、投稿が成功する

### Requirement: Misskey への動画投稿（Post video to Misskey）

システムは、Misskey が投稿対象に選択され、動画が添付されているとき、バックエンドが R2 の動画公開 URL から動画を取得し、`drive/files/create` で drive へアップロードしたうえで、そのファイル ID を `fileIds` に含めて `notes/create` でノートを作成しなければならない (SHALL)。動画のアップロードに失敗した場合、システムはノートを作成せず、その投稿を失敗として扱い、エラー一覧に `Misskey` を含めてユーザーへ通知しなければならない (SHALL)。

#### Scenario: 動画を Misskey に投稿する（Post video to Misskey successfully）

- **GIVEN** ユーザーが Misskey を投稿対象に選択し、本文と動画を入力している
- **WHEN** 投稿ボタンを押下する
- **THEN** 動画が `drive/files/create` で drive へアップロードされる
- **AND** アップロードされたファイル ID を含む `fileIds` でノートが作成され、投稿が成功する

#### Scenario: 動画の drive アップロードが失敗する（Video upload to drive fails）

- **GIVEN** ユーザーが Misskey を投稿対象に選択し、動画を添付している
- **AND** 動画の `drive/files/create` が失敗する状態である（サーバーの容量制限・形式制限など）
- **WHEN** 投稿ボタンを押下する
- **THEN** ノートは作成されず、Misskey 投稿が失敗として扱われる
- **AND** エラー一覧に `Misskey` が含まれ、ユーザーへ投稿失敗が通知される

### Requirement: 共有シートからの動画共有（Share video via Web Share）

システムは、動画が添付されている状態で共有ボタンが押されたとき、動画ファイルを `navigator.share({ files })` の `files` に含めて共有しなければならない (SHALL)。動画ファイルの共有が `navigator.canShare` でサポートされていない場合は、動画を含めずテキストのみを共有しなければならない (SHALL)。共有シートがキャンセルされた場合はエラーを表示してはならない (SHALL NOT)。

#### Scenario: 動画を共有シートで共有する（Share video to other apps）

- **GIVEN** ユーザーが動画を添付済みである
- **AND** ブラウザが動画ファイルの共有をサポートしている
- **WHEN** 共有ボタンを押下する
- **THEN** 動画ファイルと本文が共有シートに含まれ、動画対応アプリ（X など）で動画付き投稿が可能になる

#### Scenario: 動画共有が非対応環境でテキストのみにフォールバックする（Fall back to text-only share）

- **GIVEN** ユーザーが動画を添付済みである
- **AND** ブラウザが動画ファイルの共有をサポートしていない
- **WHEN** 共有ボタンを押下する
- **THEN** 動画は含まれず、テキストのみが共有シートで共有される

### Requirement: 動画投稿失敗時のエラー通知（Video post failure notification）

システムは、動画付き投稿の失敗（各 SNS への投稿・アップロードの失敗）を無言で握りつぶしてはならず (SHALL NOT)、失敗した SNS 名をエラー一覧へ追加してユーザーへ通知しなければならない (SHALL)。これはテキスト・画像投稿の既存のエラー通知と同一の仕組みに従うものとする (SHALL)。

#### Scenario: 動画投稿の失敗を通知する（Notify user of video post failure）

- **GIVEN** ユーザーが動画を添付して複数の SNS へ投稿を実行する
- **AND** そのうち 1 つの SNS への動画投稿が失敗する状態である
- **WHEN** 投稿処理が完了する
- **THEN** 失敗した SNS 名がエラー一覧に追加され、ユーザーへ通知される
- **AND** 成功した SNS の投稿は成功として通知される

## Related Changes
