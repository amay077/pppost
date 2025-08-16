const fetch = require('node-fetch');
const fs = require('fs');
const path = require('path');

// .envファイルを読み込む
require('dotenv').config({ path: path.join(__dirname, '.env') });

// テスト用の小さな画像（1x1の赤いピクセル）
const testImageBase64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

async function testSupabaseUpload() {
  console.log('Testing Supabase Storage upload...\n');
  
  // 環境変数の確認
  console.log('Environment variables:');
  console.log('SUPABASE_URL:', process.env.SUPABASE_URL ? '✓ Set' : '✗ Not set');
  console.log('SUPABASE_ANON_KEY:', process.env.SUPABASE_ANON_KEY ? '✓ Set' : '✗ Not set');
  console.log('SUPABASE_BUCKET_NAME:', process.env.SUPABASE_BUCKET_NAME || 'images');
  console.log('\n');

  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_ANON_KEY) {
    console.error('Error: Missing required environment variables');
    return;
  }

  try {
    // APIエンドポイントをテスト（ローカル環境用）
    const apiUrl = 'http://localhost:9000/.netlify/functions/supabase_upload';
    
    const requestBody = {
      image: `data:image/png;base64,${testImageBase64}`,
      filename: 'test-image.png'
    };

    console.log('Sending request to:', apiUrl);
    console.log('Request body:', JSON.stringify(requestBody, null, 2));
    console.log('\n');

    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody)
    });

    const responseText = await response.text();
    console.log('Response status:', response.status);
    console.log('Response headers:', response.headers.raw());
    console.log('Response body:', responseText);

    if (response.ok) {
      const data = JSON.parse(responseText);
      console.log('\n✅ Upload successful!');
      console.log('Image URL:', data.url);
      console.log('\nYou can view the image at:', data.url);
      
      // ダウンロードテスト
      console.log('\n--- Testing download ---');
      await testDownload(data.url);
    } else {
      console.log('\n❌ Upload failed');
    }

  } catch (error) {
    console.error('\n❌ Error:', error.message);
    console.error(error);
  }
}

async function testDownload(imageUrl) {
  try {
    console.log('Downloading from:', imageUrl);
    
    // 画像をダウンロード
    const downloadResponse = await fetch(imageUrl);
    
    console.log('Download response status:', downloadResponse.status);
    console.log('Download response headers:', downloadResponse.headers.raw());
    
    if (downloadResponse.ok) {
      const buffer = await downloadResponse.buffer();
      console.log('Downloaded image size:', buffer.length, 'bytes');
      
      // 画像の最初の数バイトを確認（PNGシグネチャ）
      const pngSignature = buffer.slice(0, 8);
      const isPng = pngSignature.toString('hex') === '89504e470d0a1a0a';
      console.log('Is valid PNG:', isPng);
      
      // Twitter APIでの使用をシミュレート
      console.log('\n--- Simulating Twitter API usage ---');
      const tempPath = `/tmp/test-download-${Date.now()}.png`;
      fs.writeFileSync(tempPath, buffer);
      console.log('Saved to temp file:', tempPath);
      
      // ファイルサイズ確認
      const stats = fs.statSync(tempPath);
      console.log('File size on disk:', stats.size, 'bytes');
      
      // クリーンアップ
      fs.unlinkSync(tempPath);
      console.log('Temp file cleaned up');
      
      console.log('\n✅ Download test successful!');
    } else {
      const errorBody = await downloadResponse.text();
      console.log('\n❌ Download failed:', downloadResponse.status, downloadResponse.statusText);
      console.log('Error body:', errorBody);
    }
    
  } catch (error) {
    console.error('\n❌ Download error:', error.message);
  }
}

// 直接実行された場合のみテストを実行
if (require.main === module) {
  testSupabaseUpload();
}

module.exports = { testSupabaseUpload, testDownload };