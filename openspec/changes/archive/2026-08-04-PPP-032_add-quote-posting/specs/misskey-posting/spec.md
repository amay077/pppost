## MODIFIED Requirements
### Requirement: Misskey へのリプライ投稿（Post reply to Misskey）

システムは、リプライ元として Misskey の自投稿が選択されているとき、`notes/create` に `replyId` を指定してリプライとして投稿しなければならない (SHALL)。画像付きの場合も同様に `replyId` を付与しなければならない (SHALL)。

Misskey のノート URL は `https://{host}/notes/{noteId}` であり、末尾のパスセグメントがそのまま API のノート ID であるため、システムはリプライ元選択ドロップダウンで選択された自投稿の URL の末尾のパスセグメントをノート ID として導出しなければならない (SHALL)。リプライ元の手動入力は受け付けない（`### Requirement: リプライ元・引用元の選択` に従う）。

リプライ元が選択されていない場合、または選択されたリプライ元グループに Misskey の投稿が含まれない場合、システムは `replyId` を付与せず通常投稿として処理しなければならない (SHALL)。

リプライ投稿に失敗した場合、システムはエラー一覧に `Misskey` を含めてユーザーへ通知しなければならない (SHALL)。

#### Scenario: 自投稿を選択してリプライする（Reply to own note）

- **GIVEN** ユーザーが Misskey に接続済みで、リプライ元として Misskey の自投稿を選択し、本文を入力している
- **WHEN** 投稿ボタンを押下する
- **THEN** `notes/create` に `replyId` が付与され、選択した自投稿へのリプライとして公開される

#### Scenario: リプライ元未指定時は通常投稿（Normal post without reply）

- **GIVEN** ユーザーが Misskey を投稿対象に選択し、リプライ元を選択していない
- **WHEN** 投稿ボタンを押下する
- **THEN** `replyId` なしの通常投稿として公開される

#### Scenario: リプライ失敗時の通知（Reply failure notification）

- **GIVEN** ユーザーがリプライ元として Misskey の自投稿を指定している
- **AND** リプライ投稿が失敗する状態である（元ノートの削除など）
- **WHEN** 投稿ボタンを押下する
- **THEN** エラー一覧に `Misskey` が含まれ、ユーザーへ投稿失敗が通知される

## ADDED Requirements
### Requirement: Misskey への引用投稿（Post quote to Misskey）

システムは、引用元として Misskey の自投稿が選択されているとき、`notes/create` に `renoteId` を指定して引用リノートとして投稿しなければならない (SHALL)。画像付きの場合も同様に、アップロード済み画像の `fileIds` とともに `renoteId` を付与しなければならない (SHALL)。

Misskey のノート URL は `https://{host}/notes/{noteId}` であり、末尾のパスセグメントがそのまま API のノート ID であるため、システムは引用元選択ドロップダウンで選択された自投稿の URL の末尾のパスセグメントをノート ID として導出しなければならない (SHALL)。

引用元が選択されていない場合、または選択された引用元グループに Misskey の投稿が含まれない場合、システムは `renoteId` を付与せず通常投稿として処理しなければならない (SHALL)。

引用投稿に失敗した場合、システムはエラー一覧に `Misskey` を含めてユーザーへ通知しなければならない (SHALL)。

#### Scenario: 自投稿を選択して引用する（Quote own note）

- **GIVEN** ユーザーが Misskey に接続済みで、引用元として Misskey の自投稿を選択し、本文を入力している
- **WHEN** 投稿ボタンを押下する
- **THEN** `notes/create` に `renoteId` が付与され、選択した自投稿の引用リノートとして公開される

#### Scenario: 画像付きで引用する（Quote with images）

- **GIVEN** ユーザーが引用元として Misskey の自投稿を選択し、本文と画像を入力している
- **WHEN** 投稿ボタンを押下する
- **THEN** `fileIds` と `renoteId` が付与された引用リノートとして公開される

#### Scenario: 引用元未選択時は通常投稿（Normal post without quote）

- **GIVEN** ユーザーが Misskey を投稿対象に選択し、引用元を選択していない
- **WHEN** 投稿ボタンを押下する
- **THEN** `renoteId` なしの通常投稿として公開される

#### Scenario: 引用失敗時の通知（Quote failure notification）

- **GIVEN** ユーザーが引用元として Misskey の自投稿を指定している
- **AND** 引用投稿が失敗する状態である（元ノートの削除など）
- **WHEN** 投稿ボタンを押下する
- **THEN** エラー一覧に `Misskey` が含まれ、ユーザーへ投稿失敗が通知される
