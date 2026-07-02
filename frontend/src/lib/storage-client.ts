import { Config } from '../config';

// 署名付きURLを使用して画像をストレージ (Cloudflare R2) にアップロード
export async function uploadImageToStorage(base64Data: string, filename: string = 'image.png'): Promise<string | null> {
  try {
    // バックエンドから署名付きURLを取得
    const presignedRes = await fetch(`${Config.API_ENDPOINT}/r2_presigned_url`, {
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

    const { uploadUrl, publicUrl, contentType } = await presignedRes.json();

    // Base64データをBlobに変換
    const base64 = base64Data.replace(/^data:image\/\w+;base64,/, '');
    const byteCharacters = atob(base64);
    const byteNumbers = new Array(byteCharacters.length);

    for (let i = 0; i < byteCharacters.length; i++) {
      byteNumbers[i] = byteCharacters.charCodeAt(i);
    }

    const byteArray = new Uint8Array(byteNumbers);
    const blob = new Blob([byteArray], { type: contentType });

    // 署名付きURLを使用してアップロード
    // 署名生成時の ContentType と一致させる必要があるため、サーバーから受け取った contentType をそのまま使う
    const uploadRes = await fetch(uploadUrl, {
      method: 'PUT',
      headers: {
        'Content-Type': contentType,
      },
      body: blob,
    });

    if (!uploadRes.ok) {
      console.error('Failed to upload image:', uploadRes.status);
      return null;
    }

    return publicUrl;
  } catch (error) {
    console.error('Error uploading to storage:', error);
    return null;
  }
}
