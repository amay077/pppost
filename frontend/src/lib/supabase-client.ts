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