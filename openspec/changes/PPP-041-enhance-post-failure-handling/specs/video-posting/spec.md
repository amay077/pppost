# video-posting Delta

## MODIFIED Requirements

### Requirement: 動画投稿失敗時のエラー通知（Video post failure notification）

システムは、動画付き投稿の失敗を無言で握りつぶしてはならず (SHALL NOT)、失敗した SNS 名と原因をエラー一覧へ追加してユーザーへ通知しなければならない (SHALL)。これはテキスト・画像投稿の既存のエラー通知と同一の仕組みに従うものとする (SHALL)。R2 への動画アップロード（署名付き URL 発行・PUT）が失敗した場合は、いずれの SNS にも到達していないため、各 SNS への投稿を試行してはならず (SHALL NOT)、投稿全体を中止して共通エラーとしてユーザーへ通知しなければならない (SHALL)。

動画 finalize ポーリング（`bluesky_video_finalize` / `threads_video_finalize` / `misskey_video_finalize`）が最大試行回数に達した場合、システムはこれをタイムアウトとして扱い、該当 SNS の投稿を **1 回** だけ自動リトライしなければならない (SHALL)。リトライはポーリング全体を再実行するものとし、既存の R2 動画公開 URL と取得済みのジョブ ID / コンテナ ID を再利用しなければならない (SHALL)。リトライ後も失敗した場合は、その SNS の動画投稿を失敗として扱い、原因（タイムアウト）をエラー一覧へ追加しなければならない (SHALL)。

#### Scenario: 動画投稿の失敗を通知する（Notify user of video post failure）

- **GIVEN** ユーザーが動画を添付して複数の SNS へ投稿を実行する
- **AND** そのうち 1 つの SNS への動画投稿が失敗する状態である
- **WHEN** 投稿処理が完了する
- **THEN** 失敗した SNS 名と原因がエラー一覧に追加され、ユーザーへ通知される
- **AND** 成功した SNS の投稿は成功として通知される

#### Scenario: 動画 finalize ポーリングのタイムアウト時にリトライして成功する（Retry succeeds after finalize polling timeout）

- **GIVEN** ユーザーが Bluesky を投稿対象に選択し、動画を添付している
- **AND** 1 回目の finalize ポーリングが最大試行回数に達してタイムアウトする状態である
- **WHEN** 投稿処理がタイムアウトを検知する
- **THEN** 同一のジョブ ID と R2 動画公開 URL を使用して finalize ポーリングが 1 回だけ再実行される
- **AND** リトライで投稿が成功した場合、Bluesky の投稿は成功として扱われる

#### Scenario: 動画 finalize ポーリングのリトライ後も失敗する（Retry also times out for finalize polling）

- **GIVEN** ユーザーが Threads を投稿対象に選択し、動画を添付している
- **AND** finalize ポーリングが 2 回連続でタイムアウトする状態である
- **WHEN** 投稿処理がリトライ後の失敗を検知する
- **THEN** リトライは 1 回で打ち切られ、Threads の動画投稿は失敗として扱われる
- **AND** 原因（タイムアウト）がエラー一覧に追加され、ユーザーへ通知される

#### Scenario: 動画処理ジョブの失敗はリトライしない（No retry on job failure）

- **GIVEN** ユーザーが Bluesky を投稿対象に選択し、動画を添付している
- **AND** 動画処理ジョブが `JOB_STATE_FAILED` になり、finalize API が失敗レスポンスを返す状態である
- **WHEN** 投稿処理が失敗を検知する
- **THEN** 自動リトライは実行されず、Bluesky の動画投稿は失敗として扱われる
- **AND** 原因がエラー一覧に追加され、ユーザーへ通知される
