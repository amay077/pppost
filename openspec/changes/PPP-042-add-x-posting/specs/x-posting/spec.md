## ADDED Requirements

### Requirement: X 接続設定（X connection settings）

システムは、X を投稿対象として使用するために、x-post-api のベース URL と API トークンを入力する接続 UI を提供しなければならない (SHALL)。接続 UI は `GET /health` を呼び出して接続を検証し、成功した場合は対象アカウントと API の状態を表示しなければならない (SHALL)。API トークンはブラウザの `localStorage` に保存し、Netlify バックエンドへ送信してはならない (SHALL NOT)。

#### Scenario: 正しい設定で接続する（Connect with valid settings）

- **GIVEN** x-post-api が tailnet 経由で到達可能で、Chrome が起動し、対象アカウントで X にログインしている
- **WHEN** ユーザーがベース URL と API トークンを入力して接続テストを実行する
- **THEN** `GET /health` が `ok: true` を返し、接続 UI に対象アカウントと投稿欄の状態が表示される
- **AND** 設定が `localStorage` に保存され、X のチェックボックスが有効になる

#### Scenario: 誤ったトークンで接続する（Connect with an invalid token）

- **GIVEN** x-post-api は到達可能である
- **WHEN** ユーザーが誤った API トークンで接続テストを実行する
- **THEN** `GET /health` は 401 を返し、接続 UI にトークンが正しくない旨が表示される
- **AND** 設定は保存されない

#### Scenario: Tailscale 未接続で接続する（Connect without Tailscale）

- **GIVEN** クライアントが tailnet に参加していない、またはホスト Mac が停止している
- **WHEN** ユーザーが接続テストを実行する
- **THEN** 接続は失敗し、Tailscale とホスト Mac の状態を確認する旨が表示される

### Requirement: X へのテキスト投稿（Post text to X）

システムは、X が投稿対象に選択されているとき、本文を `POST /post` へ送信して X に投稿しなければならない (SHALL)。リクエストには `Authorization: Bearer <token>` と、投稿ごとに生成する `Idempotency-Key` を付与しなければならない (SHALL)。システムは、本文が空の場合、または重み付き文字数が 280 を超える場合、X への投稿を行ってはならない (SHALL NOT)。

システムは、X への投稿がタイムアウト・ネットワークエラー・結果不明で終わった場合、自動で再投稿してはならない (SHALL NOT)。再実行は人間の判断で行うものとし、その旨をユーザーへ表示しなければならない (SHALL)。

#### Scenario: テキストを X に投稿する（Post text to X successfully）

- **GIVEN** X が接続済みで投稿対象に選択されている
- **AND** 本文が 1 文字以上、重み付き 280 文字以下である
- **WHEN** ユーザーが投稿ボタンを押下する
- **THEN** `Idempotency-Key` 付きの `POST /post` が送信され、X に本文が 1 件だけ投稿される

#### Scenario: 文字数超過で X に投稿しない（Do not post when too long）

- **GIVEN** X が投稿対象に選択されている
- **AND** 本文の重み付き文字数が 280 を超えている
- **WHEN** ユーザーが投稿ボタンを押下する
- **THEN** X への投稿は行われず、文字数超過のエラーが表示される
- **AND** 他の投稿対象 SNS への投稿は妨げられない

#### Scenario: 結果不明時に再投稿しない（Do not retry after an unknown result）

- **GIVEN** X への投稿リクエストがタイムアウトした、または `UNKNOWN_STATE` が返った
- **WHEN** システムが結果を確定できない
- **THEN** システムは自動で再投稿せず、「二重投稿防止のため再実行しないでください」と表示する

### Requirement: X 投稿前の疎通確認（Preflight check before posting）

システムは、X が投稿対象に選択されている場合、他の SNS へ投稿する前に `GET /health` で X の接続先を確認しなければならない (SHALL)。確認に失敗した場合、システムは X を含むすべての SNS への投稿を中止しなければならない (SHALL)。確認項目は、接続先への到達、認証、Chrome タブ、対象アカウントでのログイン、投稿欄の有無、下書きの有無、排他状態とする。

システムは、X が選択されていない場合は、この事前確認を行ってはならない (SHALL NOT)。

#### Scenario: Tailscale 未接続で X が選択されている（Tailscale is not connected）

- **GIVEN** X が投稿対象に選択されている
- **AND** クライアントが tailnet に参加していない、またはホスト Mac が停止している
- **WHEN** ユーザーが投稿ボタンを押下する
- **THEN** `GET /health` が失敗し、Bluesky・Threads・Misskey を含むすべての SNS への投稿が中止される
- **AND** Tailscale 接続とホスト Mac の状態を確認する旨が表示される

#### Scenario: X の接続先が投稿不可（X is not ready）

- **GIVEN** X が投稿対象に選択されている
- **AND** `GET /health` が `ok: false`（Chrome 未起動・未ログイン・投稿欄なし・権限不足など）を返す
- **WHEN** ユーザーが投稿ボタンを押下する
- **THEN** すべての SNS への投稿が中止され、理由が表示される

#### Scenario: X が別の投稿を処理中（X is busy）

- **GIVEN** X が投稿対象に選択されている
- **AND** `GET /health` が `busy: true` を返す
- **WHEN** ユーザーが投稿ボタンを押下する
- **THEN** すべての SNS への投稿が中止され、しばらく待つ旨が表示される

#### Scenario: X の投稿欄に下書きがある（Draft exists）

- **GIVEN** X が投稿対象に選択されている
- **AND** `GET /health` が `draft_exists: true` を返す
- **WHEN** ユーザーが投稿ボタンを押下する
- **THEN** すべての SNS への投稿が中止され、下書きを消す旨が表示される

#### Scenario: X が選択されていない（X is not selected）

- **GIVEN** X が投稿対象に選択されていない
- **WHEN** ユーザーが投稿ボタンを押下する
- **THEN** 事前確認は行われず、選択された SNS へ通常通り投稿される

### Requirement: 非対応機能の除外（Exclude unsupported features）

システムは、画像・動画・リプライ元・引用元のいずれかが指定されている場合、X を投稿対象として選択させてはならない (SHALL NOT)。システムは、X が選択された状態でこれらの要素が追加された場合、X の選択を自動的に解除し、チェックボックスを無効化しなければならない (SHALL)。

#### Scenario: 画像添付時に X を解除する（Unselect X when an image is attached）

- **GIVEN** X が投稿対象に選択されている
- **WHEN** ユーザーが画像を添付する
- **THEN** X のチェックが自動的に外れ、チェックボックスが無効になる
- **AND** 他の投稿対象 SNS への投稿は可能である

#### Scenario: リプライ指定時に X を解除する（Unselect X when a reply target is selected）

- **GIVEN** X が投稿対象に選択されている
- **WHEN** ユーザーがリプライ元または引用元を選択する
- **THEN** X のチェックが自動的に外れ、チェックボックスが無効になる

#### Scenario: X のみ選択時に非対応要素がある（X is the only target with unsupported content）

- **GIVEN** X のみが投稿対象に選択されている
- **WHEN** 画像・動画・リプライ元・引用元のいずれかが指定される
- **THEN** X の選択が外れ、投稿ボタンが無効になる

### Requirement: 投稿結果のエラー表示（Show X posting errors）

システムは、x-post-api が返すエラーコードをユーザー向けのメッセージに変換し、投稿フォーム付近にインライン表示しなければならない (SHALL)。システムは、`UNKNOWN_STATE` を通常の失敗と区別し、再実行しない旨を明示しなければならない (SHALL)。

#### Scenario: 下書きがある場合（Draft exists）

- **GIVEN** X の投稿欄に下書きが残っている
- **WHEN** ユーザーが X への投稿を実行する
- **THEN** `DRAFT_EXISTS` が返り、下書きを消さずにその旨が表示される

#### Scenario: 対象アカウントのタブがない場合（No account tab）

- **GIVEN** 対象アカウントでログインした X のタブがない
- **WHEN** ユーザーが X への投稿を実行する
- **THEN** `NO_ACCOUNT` が返り、対象アカウントのタブがない旨が表示される

#### Scenario: レート制限に達した場合（Rate limited）

- **GIVEN** x-post-api のレート制限に達している
- **WHEN** ユーザーが X への投稿を実行する
- **THEN** `RATE_LIMITED` が返り、再試行可能になる時刻が表示される

#### Scenario: 結果不明の場合（Unknown state）

- **GIVEN** X の投稿ボタンをクリックした後、結果を確認できない
- **WHEN** `UNKNOWN_STATE` が返る
- **THEN** 「結果を確認できませんでした。二重投稿防止のため再実行しないでください」と表示される

### Requirement: 文字数表示（Weighted character count）

システムは、投稿本文の文字数を X の重み付き文字数で表示しなければならない (SHALL)。表示は上限 280 に対する現在値とし、URL は 23、東アジア文字は 2 として計算しなければならない (SHALL)。

#### Scenario: 日本語と URL の文字数を表示する（Count Japanese text and URLs）

- **GIVEN** ユーザーが日本語と URL を含む本文を入力している
- **WHEN** 文字数表示を確認する
- **THEN** 日本語は 1 文字あたり 2、URL は 1 件あたり 23 として集計された値が 280 と共に表示される
- **AND** 280 を超えた場合は警告色で表示される

### Requirement: 投稿履歴の非表示（Do not show X posts in reply/quote candidates）

システムは、X の投稿一覧を取得する API を持たないため、X の投稿をリプライ元・引用元の候補に表示してはならない (SHALL NOT)。

#### Scenario: リプライ元候補に X を表示しない（X posts are not listed）

- **GIVEN** X が接続済みで投稿対象に選択されている
- **WHEN** ユーザーがリプライ元または引用元の候補を開く
- **THEN** 候補には Bluesky・Threads・Misskey の投稿のみが表示され、X の投稿は表示されない
