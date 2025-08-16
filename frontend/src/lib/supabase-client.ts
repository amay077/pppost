import { Config } from '../config';

// 署名付きURLを使用して画像をSupabaseにアップロード
export async function uploadImageToSupabase(base64Data: string, filename: string = 'image.png'): Promise<string | null> {
  try {
    // バックエンドから署名付きURLを取得
    const presignedRes = await fetch(`${Config.API_ENDPOINT}/supabase_presigned_url`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ filename }),
    });

    if (!presignedRes.ok) {
      console.error('Failed to get presigned URL:', presignedRes.status);
      return null;
    }

    const { uploadUrl, publicUrl, token } = await presignedRes.json();

    // Base64データをBlobに変換
    const base64 = base64Data.replace(/^data:image\/\w+;base64,/, '');
    const byteCharacters = atob(base64);
    const byteNumbers = new Array(byteCharacters.length);
    
    for (let i = 0; i < byteCharacters.length; i++) {
      byteNumbers[i] = byteCharacters.charCodeAt(i);
    }
    
    const byteArray = new Uint8Array(byteNumbers);
    const extension = filename.split('.').pop() || 'png';
    const blob = new Blob([byteArray], { type: `image/${extension}` });

    // 署名付きURLを使用してアップロード
    const uploadRes = await fetch(uploadUrl, {
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': `image/${extension}`,
      },
      body: blob,
    });

    if (!uploadRes.ok) {
      console.error('Failed to upload image:', uploadRes.status);
      return null;
    }

    return publicUrl;
  } catch (error) {
    console.error('Error uploading to Supabase:', error);
    return null;
  }
}

// Supabaseから画像を削除
export async function deleteImagesFromSupabase(urls: string[]): Promise<boolean> {
  if (!urls || urls.length === 0) {
    return true;
  }

  try {
    const response = await fetch(`${Config.API_ENDPOINT}/supabase_delete`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ urls }),
    });

    if (!response.ok) {
      const error = await response.text();
      console.error('Failed to delete images:', error);
      return false;
    }

    const result = await response.json();
    if (result.errors && result.errors.length > 0) {
      console.error('Some images failed to delete:', result.errors);
    }
    
    return result.success;
  } catch (error) {
    console.error('Error deleting images from Supabase:', error);
    return false;
  }
}