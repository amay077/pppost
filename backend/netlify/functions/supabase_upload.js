const { createClient } = require('@supabase/supabase-js');
const crypto = require('crypto');

const handler = async (event) => {
  // CORS対応
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
      },
      body: '',
    };
  }

  try {
    const { image, filename } = JSON.parse(event.body);

    // Supabaseクライアントの初期化
    const supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_ANON_KEY
    );

    // ユニークなファイル名を生成
    const timestamp = Date.now();
    const randomStr = crypto.randomBytes(8).toString('hex');
    const extension = filename.split('.').pop() || 'png';
    const fileName = `${timestamp}-${randomStr}.${extension}`;
    const filePath = `pppost/${fileName}`;

    // Base64データをBufferに変換
    const base64Data = image.replace(/^data:image\/\w+;base64,/, '');
    const buffer = Buffer.from(base64Data, 'base64');

    // バケット名を取得
    const bucketName = process.env.SUPABASE_BUCKET_NAME || 'images';
    console.log('Using bucket:', bucketName);

    // Supabase Storageにアップロード
    const { data, error } = await supabase.storage
      .from(bucketName)
      .upload(filePath, buffer, {
        contentType: `image/${extension}`,
        upsert: false
      });

    if (error) {
      console.error('Supabase upload error:', error);
      return {
        statusCode: 500,
        headers: {
          'Access-Control-Allow-Origin': '*',
        },
        body: JSON.stringify({ error: error.message }),
      };
    }

    // 公開URLを生成
    const { data: { publicUrl } } = supabase.storage
      .from(bucketName)
      .getPublicUrl(filePath);

    return {
      statusCode: 200,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ url: publicUrl }),
    };
  } catch (error) {
    console.error('Upload error:', error);
    return {
      statusCode: 500,
      headers: {
        'Access-Control-Allow-Origin': '*',
      },
      body: JSON.stringify({ error: error.message }),
    };
  }
};

module.exports = { handler };