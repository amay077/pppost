const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

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

  if (!supabaseUrl || !supabaseServiceKey) {
    return {
      statusCode: 500,
      headers: { 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify({ error: 'Supabase credentials not configured' })
    };
  }

  try {
    const { urls } = JSON.parse(event.body);
    
    if (!urls || !Array.isArray(urls) || urls.length === 0) {
      return {
        statusCode: 400,
        headers: { 'Access-Control-Allow-Origin': '*' },
        body: JSON.stringify({ error: 'Invalid urls parameter' })
      };
    }

    // Service Role Keyを使用してクライアントを作成
    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    const bucketName = process.env.SUPABASE_BUCKET_NAME || 'img_tmp';
    
    const deletedFiles = [];
    const errors = [];

    for (const url of urls) {
      try {
        // URLからファイルパスを抽出
        const urlParts = new URL(url);
        const pathParts = urlParts.pathname.split('/');
        const filePathIndex = pathParts.findIndex(part => part === bucketName) + 1;
        
        if (filePathIndex > 0 && filePathIndex < pathParts.length) {
          const filePath = pathParts.slice(filePathIndex).join('/');
          console.log(`Deleting file: ${filePath} from bucket: ${bucketName}`);
          
          const { error } = await supabase.storage
            .from(bucketName)
            .remove([filePath]);
          
          if (error) {
            console.error(`Error deleting ${filePath}:`, error);
            errors.push({ url, error: error.message });
          } else {
            deletedFiles.push(url);
          }
        } else {
          errors.push({ url, error: 'Could not extract file path from URL' });
        }
      } catch (error) {
        console.error(`Error processing ${url}:`, error);
        errors.push({ url, error: error.message });
      }
    }

    return {
      statusCode: 200,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ 
        deleted: deletedFiles,
        errors: errors,
        success: errors.length === 0
      })
    };
  } catch (error) {
    console.error('Delete handler error:', error);
    return {
      statusCode: 500,
      headers: { 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify({ error: error.message })
    };
  }
}

module.exports = { handler };