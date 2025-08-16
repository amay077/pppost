import { createClient } from '@supabase/supabase-js';

// Supabase設定を環境変数から取得
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
const supabaseBucketName = import.meta.env.VITE_SUPABASE_BUCKET_NAME || 'img_tmp';

// Supabaseクライアントの初期化
export const supabase = supabaseUrl && supabaseAnonKey 
  ? createClient(supabaseUrl, supabaseAnonKey)
  : null;

export const BUCKET_NAME = supabaseBucketName;

// 画像をSupabaseに直接アップロード
export async function uploadImageToSupabase(base64Data: string, filename: string = 'image.png'): Promise<string | null> {
  if (!supabase) {
    console.error('Supabase client not initialized');
    return null;
  }

  try {
    // ユニークなファイル名を生成
    const timestamp = Date.now();
    const randomStr = Math.random().toString(36).substring(2, 10);
    const extension = filename.split('.').pop() || 'png';
    const fileName = `${timestamp}-${randomStr}.${extension}`;
    const filePath = `pppost/${fileName}`;

    // Base64データをBlobに変換
    const base64 = base64Data.replace(/^data:image\/\w+;base64,/, '');
    const byteCharacters = atob(base64);
    const byteNumbers = new Array(byteCharacters.length);
    
    for (let i = 0; i < byteCharacters.length; i++) {
      byteNumbers[i] = byteCharacters.charCodeAt(i);
    }
    
    const byteArray = new Uint8Array(byteNumbers);
    const blob = new Blob([byteArray], { type: `image/${extension}` });

    // Supabase Storageにアップロード
    const { data, error } = await supabase.storage
      .from(BUCKET_NAME)
      .upload(filePath, blob, {
        contentType: `image/${extension}`,
        upsert: false
      });

    if (error) {
      console.error('Supabase upload error:', error);
      return null;
    }

    // 公開URLを生成
    const { data: { publicUrl } } = supabase.storage
      .from(BUCKET_NAME)
      .getPublicUrl(filePath);

    return publicUrl;
  } catch (error) {
    console.error('Error uploading to Supabase:', error);
    return null;
  }
}