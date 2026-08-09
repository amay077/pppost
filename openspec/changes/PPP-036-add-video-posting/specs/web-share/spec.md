## MODIFIED Requirements

### Requirement: 共有内容が空のときの無効化（Disable when content is empty）

システムは、テキストが空かつ画像が 1 枚も選択されておらず、動画も添付されていない場合、共有ボタンを無効化しなければならない (SHALL)。無効化条件は既存の投稿ボタンと同一（`text.length <= 0 && images.length <= 0 && video == null`）でなければならない (SHALL)。空内容で `navigator.share` を呼び出してはならない (SHALL NOT)。動画の共有方法は `video-posting` capability に従う。

#### Scenario: テキストも画像も動画も無いときは無効（Disabled when text, images and video are empty）

- **GIVEN** 投稿テキストが空であり、画像も 1 枚も選択されておらず、動画も添付されていない
- **WHEN** 共有ボタンの状態を確認する
- **THEN** 共有ボタンは無効化されている

#### Scenario: テキスト・画像・動画のいずれかがあれば有効（Enabled when text, image or video exists）

- **GIVEN** 投稿テキストが入力されている、画像が 1 枚以上選択されている、または動画が添付されている
- **WHEN** 共有ボタンの状態を確認する
- **THEN** 共有ボタンは有効である

#### Scenario: 動画のみ添付時は有効（Enabled when only a video is attached）

- **GIVEN** 投稿テキストが空であり、画像は選択されておらず、動画のみが添付されている
- **WHEN** 共有ボタンの状態を確認する
- **THEN** 共有ボタンは有効である
- **AND** 共有時に動画が `files` に含まれる（詳細は `video-posting` capability に従う）
