# PPP-002-url-title-expansion Specification

## ADDED Requirements

### Requirement: YouTube URL の特別処理（YouTube URL special handling）
システムは、投稿本文中に含まれる YouTube URL を検出し、動画タイトルと展開後の URL で本文全体を整形しなければならない (SHALL detect YouTube URLs in post text and format the entire text with the video title and the expanded URL)。

#### Scenario: Short URL detection（短縮 URL が本文に含まれる）
- **WHEN** 本文中に `https://youtu.be/<video-id>` 形式の短縮 URL が含まれる
- **THEN** システムはこれを YouTube URL として検出する

#### Scenario: Full URL detection（フル URL が本文に含まれる）
- **WHEN** 本文中に `https://(www.|m.)?youtube.com/watch?v=<video-id>` または `https://(www.|m.)?youtube.com/shorts/<video-id>` 形式の URL が含まれる
- **THEN** システムはこれを YouTube URL として検出する

#### Scenario: Short URL expansion（短縮 URL をフル URL に展開）
- **WHEN** 検出した URL が短縮 URL（`https://youtu.be/<video-id>`）である
- **THEN** システムは URL を `https://www.youtube.com/watch?v=<video-id>` に展開する
- **AND** クエリパラメータは `t=`（再生開始時刻）のみ保持し、`t=` 以外のクエリパラメータ（`si=`、`feature=` など）はすべて除去する

#### Scenario: Full URL normalization（フル URL の正規化）
- **WHEN** 検出した URL がフル URL（`watch?v=` または `shorts/<video-id>` 形式）である
- **THEN** システムはホストを `www.youtube.com` に統一する
- **AND** クエリパラメータは `t=` のみ保持し、`t=` 以外のクエリパラメータはすべて除去する
- **AND** `shorts` 形式は `https://www.youtube.com/shorts/<video-id>` の形式を維持する

#### Scenario: Text replacement with video title（タイトル取得成功時の本文置換）
- **WHEN** YouTube URL を検出し、動画タイトルの取得に成功した
- **THEN** システムは本文全体を `{タイトル} {展開後URL}` 形式（スペース区切り）に置き換える

#### Scenario: Mixed text replacement（周囲テキスト混在時の本文置換）
- **WHEN** 本文中に YouTube URL が含まれ、かつ URL 以外のテキストが周囲に存在する
- **THEN** システムは「URL のみ」判定の結果に関わらず YouTube の特別処理を実行する
- **AND** 本文全体を `{タイトル} {展開後URL}` 形式に置き換える（Swarm の特別処理と同じ挙動）

#### Scenario: Title fetch failure（タイトル取得失敗時）
- **WHEN** 動画タイトルの取得に失敗した（HTTP エラー・タイムアウト・不正な応答など）
- **THEN** システムはエラーをログに記録する
- **AND** 本文を変換しない（元のテキストのまま維持する）

#### Scenario: Priority over generic title fetch（既存処理との優先順位）
- **WHEN** 本文中に YouTube URL が含まれる
- **THEN** システムは既存の Swarm スクレイピング処理の後に YouTube の特別処理を実行する
- **AND** URL のみの場合の一般的なタイトル取得処理（`{タイトル} - {URL}` 形式への整形）をスキップする
