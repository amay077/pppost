import { Config } from "../config";
import { type SettingDataMastodon, type SettingDataBluesky, type SettingDataTwitter, loadPostSetting, type SettingType, loadMessage, savePostSetting } from "./func";
import type { AtpSessionData } from "@atproto/api";
import dayjs from "dayjs";
import { uploadImageToSupabase, deleteImagesFromSupabase } from "./supabase-client";

export type Post = { text: string, url: string, posted_at: Date };
export type PresentedPost = {
  display_posted_at: string | undefined,
  trimmed_text: string,
  postOfType: { [K in SettingType]: Post | undefined },
  
}

// 画像データの構造を定義 (ImagePreview.svelte から移動)
export interface ImageData {
  id: string; // 一意な ID (key 用)
  originalUrl: string;
  croppedUrl: string | null; // クロップ後の URL (なければ null)
  cropInfo?: { // クロップ情報を保存
    points: number[];
    zoom: number;
    orientation: number;
    viewportWidth: number;
    viewportHeight: number;
  };
}

export const postSettings: {
  mastodon: SettingDataMastodon | null,
  bluesky: SettingDataBluesky | null,
  twitter: SettingDataTwitter | null,
} = {
  mastodon: loadPostSetting('mastodon'),
  bluesky: loadPostSetting('bluesky'),
  twitter: loadPostSetting('twitter'),
};

export const postTo: { [K in SettingType]: boolean } = {
  mastodon: postSettings?.mastodon?.enabled ?? false,
  bluesky: postSettings?.bluesky?.enabled ?? false,
  twitter: postSettings?.twitter?.enabled ?? false,
};

export async function getApiVersion(): Promise<{ build_at: string, env_ver: string }> {

  const res = await fetch(`${Config.API_ENDPOINT}/ver`);

  if (res.ok) {
    const data = await res.json();
    return data;
  } else {
    return { build_at: 'unknown', env_ver: 'unknown' };
  }
}

export const loadMyPosts = async (): Promise<PresentedPost[]> => {

  const enableTypes = Array.from(Object.entries(postTo)).filter(([_, v]) => v).map(([k, v]) => (k as SettingType));

  const promises = [];
  
  for (const type of enableTypes) {
    switch (type) {
    case 'mastodon':
      promises.push(loadMyPostsMastodon().then(posts => ({ type: 'mastodon', posts })));
      break;
    case 'bluesky':
      promises.push(loadMyPostsBluesky().then(posts => ({ type: 'bluesky', posts })));
      break;
    case 'twitter':
      promises.push(loadMyPostsTwritter().then(posts => ({ type: 'twitter', posts })));
      break;
    }
  }  
  const posts = await Promise.allSettled(promises);

  const succeededPosts = posts.filter((p) => p.status == 'fulfilled').map(x => x.value).reduce((acc, cur) => {

    (cur?.posts ?? []).forEach((p) => {
      acc.push({ type: cur.type as SettingType, post: p });
    });
    
    return acc;
  }, [] as { type: SettingType, post: Post }[]);

  const trimText = (text: string) => {
    const max = 50;
    if (text.length > max) {
      return text.substring(0, max) + '...';
    } else {
      return text;
    }
  }

  const groupByText = (input: { type: SettingType, post: Post }[]): PresentedPost[] => {
    const grouped: { [key: string]: PresentedPost } = {};
  
    input.forEach(({ type, post }) => {
      const key = post.text.substring(0, 10);
      if (!grouped[key]) {
        grouped[key] = {
          display_posted_at: dayjs(post.posted_at).format('M/DD H:MM'),
          trimmed_text: trimText(post.text),
          postOfType: { mastodon: undefined, twitter: undefined, bluesky: undefined }
        };
      }
      grouped[key].postOfType[type] = post;
    });
  
    return Object.values(grouped);
  }
  
  const result = groupByText(succeededPosts ?? []);
  console.log(result);

  return result;

  return succeededPosts.map((p) => {
    return {
      display_posted_at: dayjs(p.post.posted_at).format('M/DD H:MM'),
      trimmed_text: trimText(p.post.text),
      postOfType: {
        mastodon: p.type == 'mastodon' ? p.post : undefined,
        bluesky: p.type == 'bluesky' ? p.post : undefined,
        twitter: p.type == 'twitter' ? p.post : undefined,
      }
    }
  });
}

export const postToSns = async (text: string, imageDataURLs: string[], options: { reply_to_ids: {
  mastodon: string,
  bluesky: string,
  twitter: string,
}}): Promise<{ errors: string[] }> => {
  const errors: string[] = [];

  // 画像を一度だけSupabaseにアップロード
  const uploadedImageUrls: string[] = [];
  if (imageDataURLs.length > 0) {
    for (let i = 0; i < imageDataURLs.length; i++) {
      const dataURL = imageDataURLs[i];
      const image = dataURL.split(',')[1];
      const filename = `image_${i + 1}.png`;
      const imageUrl = await uploadImage(image, filename);
      
      if (imageUrl != null) {
        uploadedImageUrls.push(imageUrl);
      } else {
        // 画像アップロードに失敗した場合は投稿を中止
        console.error(`Failed to upload image ${i + 1}`);
        return { errors: ['画像のアップロードに失敗しました'] };
      }
    }
  }

  const enableTypes = Array.from(Object.entries(postTo)).filter(([_, v]) => v).map(([k, v]) => (k as SettingType));

  const promises = [];
  
  for (const type of enableTypes) {
    switch (type) {
    case 'mastodon':
      promises.push(postToMastodon(text, uploadedImageUrls, options?.reply_to_ids?.mastodon).then((r) => { if (!r) errors.push('Mastodon') }));
      break;
    case 'bluesky':
      promises.push(postToBluesky(text, uploadedImageUrls, options?.reply_to_ids?.bluesky).then((r) => { if (!r) errors.push('Bluesky') }));
      break;
    case 'twitter':
      promises.push(postToTwritter(text, uploadedImageUrls, options?.reply_to_ids?.twitter).then((r) => { if (!r) errors.push('Twitter') }));
      break;
    }

    await Promise.allSettled(promises);
  }

  if (errors.length == 0) {
    // 全てのSNSへの投稿が成功した場合のみ画像を削除
    if (uploadedImageUrls.length > 0) {
      console.log('Deleting temporary images from Supabase...');
      const deleteResult = await deleteImagesFromSupabase(uploadedImageUrls);
      if (!deleteResult) {
        console.error('Failed to delete some temporary images');
      } else {
        console.log('Temporary images deleted successfully');
      }
    }

    for (const [k, v] of Object.entries(postSettings)) {
      const type = k as SettingType;
      if (v != null) {
        v.enabled = postTo[type] == true;
        savePostSetting(v);
      }
    }
  } else {
    // エラーがある場合は画像を削除しない（再投稿の可能性があるため）
    console.log('Post failed, keeping temporary images for retry');
  }

  return { errors };
};  



const postToMastodon = async (text: string, imageUrls: string[], reply_to_id: string): Promise<boolean> => {
  try {
    const settings = postSettings.mastodon!;
    const MASTODON_HOST = settings.server;
    const ACCESS_TOKEN = settings.token_data.access_token;
    const status = text;

    // const res = await fetch(`https://${MASTODON_HOST}/api/v1/statuses`, {
    //   method: 'POST',
    //   headers: {
    //     'Authorization': `Bearer ${ACCESS_TOKEN}`,
    //     'Content-Type': 'application/json',
    //   },
    //   body: JSON.stringify({ status, media_ids }),
    // });

    const res = await fetch(`${Config.API_ENDPOINT}/mastodon_post`, {
      method: 'POST',
      headers: {
        'Content-Type': 'text/plain',
      },
      body: JSON.stringify({ 
        host: MASTODON_HOST, 
        token: settings.token_data.access_token, 
        status, 
        images: imageUrls,
        reply_to_id 
      }),
    });


    if (res.ok) {
    } else {
      return false;
    }
    return true;       
  } catch (error) {
    console.error(`postToMastodon -> error:`, error);
    return false;       
  }
};  


const loadMyPostsBluesky = async (): Promise<Post[]> => {
  try {
    const sessionData = postSettings.bluesky?.data?.sessionData;
    if (!sessionData) {
      console.error('Bluesky session data not found');
      return [];
    }

    const res = await fetch(`${Config.API_ENDPOINT}/bluesky_posts`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ sessionData }),
    });

    if (res.ok) {
      const resJson = await res.json();
      
      // 新しいセッションデータを保存
      if (resJson.sessionData) {
        postSettings.bluesky = { 
          type: 'bluesky', 
          title: 'Bluesky', 
          enabled: true, 
          data: { sessionData: resJson.sessionData }
        };
        savePostSetting(postSettings.bluesky);
      }
      
      return resJson.posts || [];
    } else {
      return [];
    }
  } catch (error) {
    console.error(`loadMyPostsBluesky -> error:`, error);
    return [];
  }
}; 

const loadMyPostsTwritter = async (): Promise<Post[]> => {
  try {
    const settings = postSettings.twitter!;
    const token = settings.token_data.token;

    const res = await fetch(`${Config.API_ENDPOINT}/twitter_posts`, {
      method: 'POST',
      headers: {
        'Content-Type': 'text/plain',
      },
      body: JSON.stringify({ token }),
    });

    if (res.ok) {
      const resJson = await res.json();
      console.log(`FIXME 後で消す  -> loadMyPostsTwritter -> resJson:`, resJson);
      return resJson;
    } else {
      return [];
    }
  } catch (error) {
    console.error(`loadMyPostsTwritter -> error:`, error);
    return [];       
  }
};    

const loadMyPostsMastodon = async (): Promise<Post[]> => {
  try {
    const settings = postSettings.mastodon!;
    const host = settings.server;
    const token = settings.token_data.access_token;

    const res = await fetch(`${Config.API_ENDPOINT}/mastodon_posts`, {
      method: 'POST',
      headers: {
        'Content-Type': 'text/plain',
      },
      body: JSON.stringify({ host, token }),
    });

    if (res.ok) {
      const resJson = await res.json();
      console.log(`FIXME 後で消す  -> loadMyPostsMastodon -> resJson:`, resJson);
      return resJson;
    } else {
      return [];
    }
  } catch (error) {
    console.error(`loadMyPostsMastodon -> error:`, error);
    return [];       
  }
};    


const postToBluesky = async (text: string, imageUrls: string[], reply_to_id: string): Promise<boolean> => {
  try {
    const sessionData = postSettings.bluesky?.data?.sessionData;
    if (!sessionData) {
      console.error('Bluesky session data not found');
      return false;
    }

    // バックエンドにリクエストを送信
    const res = await fetch(`${Config.API_ENDPOINT}/bluesky_post`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        sessionData,
        text,
        images: imageUrls,
        reply_to_id
      }),
    });

    if (res.ok) {
      const resJson = await res.json();
      console.log(`postToBluesky response:`, resJson);
      
      // 新しいセッションデータを保存
      if (resJson.sessionData) {
        postSettings.bluesky = { 
          type: 'bluesky', 
          title: 'Bluesky', 
          enabled: true, 
          data: { sessionData: resJson.sessionData }
        };
        savePostSetting(postSettings.bluesky);
      }
      
      return true;
    } else {
      const errorData = await res.json();
      console.error('Bluesky post failed:', errorData);
      return false;
    }
  } catch (error) {
    console.error(`postToBluesky -> error:`, error);
    return false;
  }
}; 


const uploadImage = async (content: string, filename: string = 'image.png'): Promise<string | null> => {
  // Supabaseに直接アップロード
  return await uploadImageToSupabase(content, filename);
}

const postToTwritter = async (text: string, imageUrls: string[], reply_to_id: string): Promise<boolean> => {
  try {
    const settings = postSettings.twitter!;
    const token = settings.token_data.token;

    /*
    const images: string[] = [
      'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAgAAAAIAQMAAAD+wSzIAAAABlBMVEX///+/v7+jQ3Y5AAAADklEQVQI12P4AIX8EAgALgAD/aNpbtEAAAAASUVORK5CYII',
    ];
    */
    const res = await fetch(`${Config.API_ENDPOINT}/twitter_post`, {
      method: 'POST',
      headers: {
        'Content-Type': 'text/plain',
      },
      body: JSON.stringify({ token, text, images: imageUrls, reply_to_id }),
    });

    if (res.ok) {
      const resJson = await res.json();
      console.log(`FIXME 後で消す  -> postToTwritter -> resJson:`, resJson);
    } else {
      return false;
    }
    return true;       
  } catch (error) {
    console.error(`postToMastodon -> error:`, error);
    return false;       
  }
};    
