# Threads Posting Specification

## Overview

Threads 長命トークン（60 日）の自動リフレッシュ要件を追加する。PPP-009 で保存している `token_data`（`access_token`, `token_type`, `expires_in`, `obtained_at`）を活用し、アプリ起動時にトークンを更新する。

## ADDED Requirements

### Requirement: Threads 長命トークンの自動リフレッシュ（Auto-refresh long-lived token）

システムは、アプリ起動時に Threads の長命トークンが取得から 24 時間以上経過している場合、バックエンド経由で Threads API（`grant_type=th_refresh_token`）を呼び出してトークンをリフレッシュしなければならない (SHALL)。Threads API の制約により、取得から 24 時間未満のトークンをリフレッシュしてはならない (SHALL NOT)。

リフレッシュに成功した場合、システムは新しい `access_token` / `token_type` / `expires_in` と更新時刻（`obtained_at`）を `localStorage` キー `ppp_setting_threads` の `token_data` へ保存しなければならない (SHALL)。

リフレッシュに失敗した場合、システムは既存のトークンと接続状態を維持しなければならず (SHALL)、保存済みトークンを削除してはならない (SHALL NOT)。失効済みトークンによる投稿失敗は、既存のエラー通知要件（エラー一覧に `Threads` を含めて通知）で処理する。

`client_secret` をフロントエンドで扱ってはならない (SHALL NOT)（リフレッシュ API は `client_secret` 不要だが、呼び出しは既存構成に合わせてバックエンド経由とする）。

リフレッシュ可否の判定は `obtained_at` からの経過時間のみで行う（`expires_in` は判定に使用しない）。Threads API の制約が「取得から 24 時間以上経過」であるため、残り寿命ではなく経過時間が判定基準となる。OAuth 接続直後の起動では経過時間が 24 時間未満のため、リフレッシュは自然に行われない。

#### Scenario: 24 時間経過後の起動でトークンが更新される（Refresh on launch after 24 hours）

- **GIVEN** ユーザーが Threads に接続済みで、`token_data.obtained_at` から 24 時間以上経過している
- **WHEN** アプリを起動する
- **THEN** バックエンド経由で Threads API のリフレッシュが呼び出される
- **AND** 新しい `access_token` と更新後の `obtained_at` が `ppp_setting_threads` に保存される
- **AND** Threads は「接続済み」のまま表示される

#### Scenario: 24 時間未満ではリフレッシュしない（No refresh within 24 hours）

- **GIVEN** ユーザーが Threads に接続済みで、`token_data.obtained_at` から 24 時間未満である
- **WHEN** アプリを起動する
- **THEN** リフレッシュ API は呼び出されない
- **AND** `token_data` は変更されない

#### Scenario: リフレッシュ失敗時も接続状態を維持する（Keep connection on refresh failure）

- **GIVEN** ユーザーが Threads に接続済みで、`token_data.obtained_at` から 24 時間以上経過している
- **AND** リフレッシュ API が失敗する状態である（ネットワークエラーやトークン失効など）
- **WHEN** アプリを起動する
- **THEN** 既存の `token_data` が維持され、削除されない
- **AND** Threads は「接続済み」のまま表示される
- **AND** トークンが失効していた場合、投稿時にエラー一覧へ `Threads` が含まれて通知される（既存要件）

#### Scenario: 未接続時は何もしない（No-op when not connected）

- **GIVEN** ユーザーが Threads に接続していない（`ppp_setting_threads` が存在しない）
- **WHEN** アプリを起動する
- **THEN** リフレッシュ API は呼び出されない
