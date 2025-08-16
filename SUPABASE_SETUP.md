# Supabase Storage セットアップガイド

PPPOSTでX（Twitter）の画像投稿にSupabase Storageを使用するための設定手順です。

## 1. Supabaseプロジェクトの作成

1. [Supabase](https://supabase.com/)にアクセス
2. 「Start your project」をクリック
3. GitHubアカウントでサインイン（クレジットカード不要）
4. 「New project」をクリック
5. プロジェクト名とパスワードを設定

## 2. Storage バケットの作成

1. Supabaseダッシュボードの左メニューから「Storage」を選択
2. 「New bucket」をクリック
3. バケット名を入力（例：`images`）
4. 「Public bucket」にチェック（画像を公開URLでアクセス可能にする）
5. 「Create bucket」をクリック

## 3. APIキーの取得

1. 左メニューの「Settings」→「API」を選択
2. 以下の情報をコピー：
   - **Project URL**: `https://your-project.supabase.co`
   - **anon public**: `eyJhbGciOiJI...`（公開キー）

## 4. 環境変数の設定

### フロントエンド環境変数

`frontend/.env`ファイルを作成し、以下を設定：

```bash
# SupabaseプロジェクトのURL
VITE_SUPABASE_URL=https://your-project.supabase.co

# Supabase公開キー（anon key）
VITE_SUPABASE_ANON_KEY=eyJhbGciOiJI...

# バケット名（作成したバケット名）
VITE_SUPABASE_BUCKET_NAME=img_tmp
```

**注意**: フロントエンドから直接Supabaseにアップロードするため、Netlifyの関数を経由しません。これにより、Netlifyのレート制限を回避できます。

## 5. Storage ポリシーの設定（重要）

Supabaseは初期状態でRLS（Row Level Security）が有効になっているため、ポリシーを設定する必要があります：

1. Supabaseダッシュボードで「Storage」を選択
2. 作成したバケット（images）をクリック
3. 「Policies」タブを選択
4. 「New policy」をクリック
5. 以下のポリシーを作成：

### アップロード用ポリシー（INSERT）
- **Policy name**: `Allow public uploads`
- **Policy type**: `INSERT`
- **Target roles**: `anon`（匿名ユーザー）
- **Policy definition**:
  ```sql
  true
  ```

### 読み取り用ポリシー（SELECT）
- **Policy name**: `Allow public read`
- **Policy type**: `SELECT`
- **Target roles**: `anon`（匿名ユーザー）
- **Policy definition**:
  ```sql
  true
  ```

これにより、誰でも画像のアップロードと読み取りが可能になります。

## 6. デプロイ

1. フロントエンドの依存関係をインストール：
   ```bash
   cd frontend
   npm install
   ```

2. ビルドとデプロイ：
   ```bash
   npm run build
   netlify deploy --prod
   ```

## 無料枠の制限

- **ストレージ**: 1GB
- **帯域幅**: 2GB/月
- **ファイルサイズ**: 最大50MB/ファイル

## トラブルシューティング

### 画像アップロードエラー
- Supabase URLとAPIキーが正しいか確認
- バケット名が正しいか確認
- バケットが公開設定になっているか確認

### 画像が表示されない
- Storageポリシーを確認
- バケットのPublic設定を確認
- 生成されたURLにアクセスできるか確認

### 容量制限
- 無料枠は1GBまで
- 定期的に不要な画像を削除することを推奨