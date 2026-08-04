## ADDED Requirements
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
