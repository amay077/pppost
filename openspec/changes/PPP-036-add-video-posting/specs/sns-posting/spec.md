## ADDED Requirements

### Requirement: 動画と画像の併用禁止（Cannot mix videos and images）

システムは、動画が添付された投稿について、画像を同時に添付してはならない (SHALL NOT)。画像が添付された投稿に動画を同時に添付してはならない (SHALL NOT)。動画を添付する場合の各 SNS への投稿の振る舞いは `video-posting` capability に従う。

#### Scenario: 動画と画像の同時添付はできない（Video and images cannot coexist）

- **GIVEN** ユーザーが動画を添付済みである
- **WHEN** さらに画像を添付しようとする
- **THEN** 画像の添付は受け付けられない

#### Scenario: 画像に動画を追加できない（Images cannot be accompanied by video）

- **GIVEN** ユーザーが画像を添付済みである
- **WHEN** さらに動画を添付しようとする
- **THEN** 動画の添付は受け付けられない
