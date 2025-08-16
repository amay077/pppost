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
    const { filename } = JSON.parse(event.body);

    // Supabaseクライアントの初期化（サーバーサイドでのみ）
    const supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY // service role keyを使用
    );

    // ユニークなファイル名を生成
    const timestamp = Date.now();
    const randomStr = crypto.randomBytes(8).toString('hex');
    const extension = filename.split('.').pop() || 'png';
    const fileName = `${timestamp}-${randomStr}.${extension}`;
    const filePath = `pppost/${fileName}`;

    // 署名付きアップロードURLを生成（5分間有効）
    const { data, error } = await supabase.storage
      .from(process.env.SUPABASE_BUCKET_NAME || 'img_tmp')
      .createSignedUploadUrl(filePath, {
        expiresIn: 300 // 5分
      });

    if (error) {
      console.error('Supabase presigned URL error:', error);
      return {
        statusCode: 500,
        headers: {
          'Access-Control-Allow-Origin': '*',
        },
        body: JSON.stringify({ error: error.message }),
      };
    }

    // 公開URLも生成して返す
    const { data: { publicUrl } } = supabase.storage
      .from(process.env.SUPABASE_BUCKET_NAME || 'img_tmp')
      .getPublicUrl(filePath);

    return {
      statusCode: 200,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ 
        uploadUrl: data.signedUrl,
        publicUrl: publicUrl,
        path: filePath,
        token: data.token
      }),
    };
  } catch (error) {
    console.error('Presigned URL error:', error);
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