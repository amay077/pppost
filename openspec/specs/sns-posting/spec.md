# sns-posting Specification

## Purpose
本アプリがフロントエンドから投稿可能な SNS（投稿対象）の範囲を定める。投稿対象は Bluesky・Threads・Misskey とし、Twitter (X) と Mastodon はフロントエンドから廃除する。バックエンドの Twitter 用機能や twitter-text による文字数カウント表示は温存する。各投稿対象の接続・投稿の詳細な振る舞いは、当該 SNS の capability（`threads-posting`、`misskey-posting` 等）に従う。
## Requirements
### Requirement: 投稿対象 SNS の範囲

システムは、フロントエンドからの投稿対象を Bluesky・Threads・Misskey に限定しなければならない (SHALL)。Twitter (X) および Mastodon は投稿対象から除外し、投稿対象の選択肢・接続 UI・投稿処理をフロントエンドに表示・実行してはならない (SHALL NOT)。

各投稿対象の接続・投稿の詳細な振る舞いは、当該 SNS の capability（`threads-posting`、`misskey-posting` 等）に従う。

twitter-text による文字数カウント表示は、本要件の対象外として温存してよい。

#### Scenario: 廃止済み SNS が表示されない（Removed SNS are not selectable）

- **GIVEN** ユーザーがアプリの投稿画面を開いている
- **WHEN** 投稿対象 SNS の選択肢を確認する
- **THEN** 選択肢には Bluesky・Threads・Misskey のみが表示される
- **AND** Twitter (X) および Mastodon の投稿対象チェックボックスと接続 UI は表示されない

#### Scenario: 既存 SNS への投稿は従来通り動作する（Existing SNS posting still works）

- **GIVEN** ユーザーが Bluesky・Threads・Misskey のいずれかに接続済みである
- **WHEN** テキストと画像を入力して投稿を実行する
- **THEN** それらの SNS への投稿が従来通り正常に完了する

#### Scenario: 文字数カウント表示は維持される（Character count remains）

- **GIVEN** ユーザーが投稿テキストを入力している
- **WHEN** テキスト入力エリアを確認する
- **THEN** twitter-text による文字数カウント表示が投稿長の目安として表示される

### Requirement: リプライ元・引用元の選択（Select reply/quote target from own posts）

システムは、リプライ元と引用元の指定を、自分の投稿一覧（自投稿候補のドロップダウン）からの選択に限定しなければならない (SHALL)。リプライ元・引用元の URL や ID の手動入力欄を表示してはならず (SHALL NOT)、手動入力を受け付けてはならない (SHALL NOT)。

システムは、リプライと引用を同時に指定してはならない (SHALL NOT)。リプライ元を選択した場合は引用元の選択を解除し、引用元を選択した場合はリプライ元の選択を解除しなければならない (SHALL)。

#### Scenario: リプライ元をドロップダウンから選択する（Select reply target from dropdown）

- **GIVEN** ユーザーがリプライ元選択 UI を展開している
- **WHEN** 自分の投稿一覧のドロップダウンからリプライ元を選択する
- **THEN** リプライ元として選択された投稿がリプライの対象となる
- **AND** 手動入力欄は表示されない

#### Scenario: リプライと引用を同時に選択できない（Cannot select reply and quote simultaneously）

- **GIVEN** ユーザーがリプライ元を選択済みである
- **WHEN** 引用元を選択する
- **THEN** リプライ元の選択が解除され、引用元のみが選択された状態になる
- **AND** 投稿時には引用のみが適用される

### Requirement: Bluesky への引用投稿（Post quote to Bluesky）

システムは、引用元として Bluesky の自投稿が選択されているとき、バックエンドが引用元の投稿の uri と cid を解決し、投稿レコードの `embed` に `app.bsky.embed.record`（引用のみ）を指定して、引用ポストとして投稿しなければならない (SHALL)。

画像を添付して引用する場合、システムは `embed` に `app.bsky.embed.recordWithMedia` を指定し、`record` に引用元、`media` に画像（`app.bsky.embed.images`）を含めなければならない (SHALL)。画像がないがテキスト内 URL の OGP 埋め込みが発生する場合、システムは `app.bsky.embed.recordWithMedia` の `media` に OGP カード（`app.bsky.embed.external`）を含めなければならない (SHALL)。

引用元が選択されていない場合、または選択された引用元グループに Bluesky の投稿が含まれない場合、システムは `embed` に引用を指定せず、従来の投稿フロー（画像・OGP・通常投稿）のまま投稿しなければならない (SHALL)。

引用投稿に失敗した場合、システムは失敗を無言で握りつぶしてはならず (SHALL NOT)、エラー一覧に `Bluesky` を含めてユーザーへ通知しなければならない (SHALL)。

#### Scenario: テキストのみの引用投稿（Quote post without media）

- **GIVEN** ユーザーが引用元として Bluesky の自投稿を選択し、本文を入力し、画像を添付していない
- **WHEN** 投稿ボタンを押下する
- **THEN** `embed` に `app.bsky.embed.record`（引用元の uri/cid）が指定されて投稿される

#### Scenario: 画像付きの引用投稿（Quote post with images）

- **GIVEN** ユーザーが引用元として Bluesky の自投稿を選択し、本文と画像を入力している
- **WHEN** 投稿ボタンを押下する
- **THEN** `embed` に `app.bsky.embed.recordWithMedia`（`record` に引用元、`media` に画像）が指定されて投稿される

#### Scenario: 引用元未選択時は通常投稿（Normal post without quote）

- **GIVEN** ユーザーが Bluesky を投稿対象に選択し、引用元を選択していない
- **WHEN** 投稿ボタンを押下する
- **THEN** 引用の `embed` なしで、従来の投稿フロー（画像・OGP・通常投稿）が実行される

#### Scenario: 引用失敗時の通知（Quote failure notification）

- **GIVEN** ユーザーが引用元として Bluesky の自投稿を選択している
- **AND** 引用投稿が失敗する状態である（引用元の削除・解決不能など）
- **WHEN** 投稿ボタンを押下する
- **THEN** エラー一覧に `Bluesky` が含まれ、ユーザーへ投稿失敗が通知される

### Requirement: 動画と画像の併用禁止（Cannot mix videos and images）

システムは、動画が添付された投稿について、画像を同時に添付してはならない (SHALL NOT)。画像が添付された投稿に動画を同時に添付してはならない (SHALL NOT)。動画の選択・上限チェック・各 SNS への投稿の振る舞いは `video-posting` capability に従う。

#### Scenario: 動画と画像の同時添付はできない（Video and images cannot coexist）

- **GIVEN** ユーザーが動画を添付済みである
- **WHEN** さらに画像を添付しようとする
- **THEN** 画像の添付は受け付けられない

#### Scenario: 画像に動画を追加できない（Images cannot be accompanied by video）

- **GIVEN** ユーザーが画像を添付済みである
- **WHEN** さらに動画を添付しようとする
- **THEN** 動画の添付は受け付けられない

## Related Changes

- [2026-06-03-PPP-006-remove-twitter-posting](../../changes/archive/2026-06-03-PPP-006-remove-twitter-posting/proposal.md)
- [2026-08-01-PPP-025-add-misskey-posting](../../changes/archive/2026-08-01-PPP-025-add-misskey-posting/proposal.md)
- [2026-08-04-PPP-032_add-quote-posting](../../changes/archive/2026-08-04-PPP-032_add-quote-posting/proposal.md)
- [2026-08-04-PPP-029-remove-mastodon-posting](../../changes/archive/2026-08-04-PPP-029-remove-mastodon-posting/proposal.md)
