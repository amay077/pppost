# Image Upload

## Overview

各 SNS への画像アップロード時に、API のファイルサイズ上限を超えないよう自動リサイズする機能の仕様。

## ADDED Requirements

### Requirement: Mastodon image auto-resize（Mastodon 画像の自動リサイズ）

Mastodon への画像アップロード時、システムは画像サイズが 5 MB を超える場合に自動でリサイズしなければならない (SHALL)。

リサイズ処理は以下の手順で行う:

1. 画像バッファのサイズが 5,242,880 bytes (5 MB) を超えるか判定する
2. 超過時、sharp を使用して目標サイズの 90% に収まるようスケールファクターを算出する
3. 元画像のアスペクト比を維持したまま縮小し、JPEG (quality 85) に変換する
4. リサイズ後のバッファで Mastodon API にアップロードする
5. FormData の contentType を `image/jpeg` に設定する

5 MB 以下の画像は一切加工せずそのままアップロードしなければならない (MUST)。

#### Scenario: Image exceeds 5 MB limit（5 MB 超の画像をアップロード）

- **GIVEN** ユーザーが 8 MB の PNG 画像を添付している
- **WHEN** Mastodon への投稿を実行する
- **THEN** 画像が自動的に 5 MB 以下にリサイズされ、JPEG 形式で Mastodon API にアップロードされる
- **AND** 投稿が正常に完了する

#### Scenario: Image within 5 MB limit（5 MB 以下の画像をアップロード）

- **GIVEN** ユーザーが 2 MB の JPEG 画像を添付している
- **WHEN** Mastodon への投稿を実行する
- **THEN** 画像はリサイズも形式変換もされずにそのまま Mastodon API にアップロードされる
- **AND** 投稿が正常に完了する
