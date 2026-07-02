import { Config } from "../config";
import { type SettingDataMastodon, type SettingDataBluesky, type SettingDataThreads, loadPostSetting, type SettingType, loadMessage, savePostSetting, loadSessionId } from "./func";
import dayjs from "dayjs";
import { uploadImageToStorage } from "./storage-client";

// トークンを要する API 呼び出しに付与する共通ヘッダを組み立てる。
// トークンはサーバー保管のため、クライアントは Bearer セッション ID のみを送る。
const buildAuthHeaders = (contentType: string): Record<string, string> => {
  const headers: Record<string, string> = { 'Content-Type': contentType };
  const sessionId = loadSessionId();
  if (sessionId != null) {
    headers['Authorization'] = `Bearer ${sessionId}`;
  }
  return headers;
};

export type Post = { text: string, url: string, posted_at: Date, id?: string };
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
  threads: SettingDataThreads | null,
} = {
  mastodon: loadPostSetting('mastodon'),
  bluesky: loadPostSetting('bluesky'),
  threads: loadPostSetting('threads'),
};

export const postTo: { [K in SettingType]: boolean } = {
  mastodon: postSettings?.mastodon?.enabled ?? false,
  bluesky: postSettings?.bluesky?.enabled ?? false,
  threads: postSettings?.threads?.enabled ?? false,
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
    case 'threads':
      promises.push(loadMyPostsThreads().then(posts => ({ type: 'threads', posts })));
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

  /**
   * テキストを正規化する（URLやHTMLタグ、エンティティ、空白を除去・統一）
   */
  const normalizeText = (text: string): string => {
    // URL を除去（プロトコル付き）
    // RFC3986に基づく URL 文字セットを使用し、日本語文字の直前で停止
    let normalized = text.replace(/https?:\/\/[a-zA-Z0-9\/?#\[\]@!$&'()*+,;=:._~%-]+/g, '');

    // URL を除去（プロトコルなし: example.com/path や example.com?query など）
    // ドメイン名パターンで、句読点以外で終わるものを除去
    normalized = normalized.replace(/\b[a-zA-Z0-9][-a-zA-Z0-9.]*\.[a-zA-Z]{2,}[\/a-zA-Z0-9?#\[\]@!$&'()*+,;=:._~%-]*[^\s。、！？,.!?]/g, '');

    // HTML タグを除去
    normalized = normalized.replace(/<[^>]+>/g, '');

    // HTML エンティティをデコード
    const htmlEntities: { [key: string]: string } = {
      '&nbsp;': ' ',
      '&lt;': '<',
      '&gt;': '>',
      '&quot;': '"',
      '&apos;': "'",
      '&amp;': '&'
    };
    for (const [entity, char] of Object.entries(htmlEntities)) {
      normalized = normalized.replace(new RegExp(entity, 'g'), char);
    }

    // 連続する空白文字を1つに統一
    normalized = normalized.replace(/\s+/g, ' ');

    // 前後の空白を削除
    normalized = normalized.trim();

    return normalized;
  };

  const groupByText = (input: { type: SettingType, post: Post }[]): PresentedPost[] => {
    // 1パス目: すべての投稿を正規化して最短文字列長を計算
    const normalizedTexts = input.map(({ post }) => normalizeText(post.text));
    const minLength = Math.min(...normalizedTexts.map(n => n.length));
    const compareLength = Math.max(10, Math.min(100, Math.floor(minLength * 0.6)));

    // 2パス目: グループ化
    const grouped: { [key: string]: PresentedPost } = {};

    input.forEach(({ type, post }, index) => {
      const key = normalizedTexts[index].substring(0, compareLength);
      if (!grouped[key]) {
        grouped[key] = {
          display_posted_at: dayjs(post.posted_at).format('M/DD H:mm'),
          trimmed_text: trimText(post.text),
          postOfType: { mastodon: undefined, bluesky: undefined, threads: undefined }
        };
      }
      grouped[key].postOfType[type] = post;
    });

    // グループ内の最新投稿日時を代表値として降順ソートする
    // （SNS ごとに連結された順のままだと Threads 分が末尾に残るため）
    const latestPostedAt = (p: PresentedPost): number =>
      Math.max(...Object.values(p.postOfType)
        .filter((post): post is Post => post != null)
        .map(post => dayjs(post.posted_at).valueOf()));

    return Object.values(grouped).sort((a, b) => latestPostedAt(b) - latestPostedAt(a));
  }
  
  const result = groupByText(succeededPosts ?? []);
  console.log(result);

  return result;
}

export const postToSns = async (text: string, imageDataURLs: string[], options: { reply_to_ids: {
  mastodon: string,
  bluesky: string,
  threads: string,
}}): Promise<{ errors: string[] }> => {
  const errors: string[] = [];

  // 画像を一度だけストレージ (R2) にアップロード
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
    case 'threads':
      promises.push(postToThreads(text, uploadedImageUrls, options?.reply_to_ids?.threads).then((r) => { if (!r) errors.push('Threads') }));
      break;
    }

    await Promise.allSettled(promises);
  }

  // PR ゴースト投稿の自動付与はサーバー側（threads_post）で本投稿成功時に発火するため、
  // クライアントからは呼び出さない。

  if (errors.length == 0) {
    // 一時アップロードした画像は R2 のライフサイクルルールで自動削除される
    for (const [k, v] of Object.entries(postSettings)) {
      const type = k as SettingType;
      if (v != null) {
        v.enabled = postTo[type] == true;
        savePostSetting(v);
      }
    }
  }

  return { errors };
};


const postToMastodon = async (text: string, imageUrls: string[], reply_to_id: string): Promise<boolean> => {
  try {
    const status = text;

    // host / token はサーバーがセッションから復号して使用するため、クライアントは送らない
    const res = await fetch(`${Config.API_ENDPOINT}/mastodon_post`, {
      method: 'POST',
      headers: buildAuthHeaders('text/plain'),
      body: JSON.stringify({
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


const postToThreads = async (text: string, imageUrls: string[], reply_to_id?: string): Promise<boolean> => {
  try {
    // トークンはサーバーがセッションから復号して使用する
    const res = await fetch(`${Config.API_ENDPOINT}/threads_post`, {
      method: 'POST',
      headers: buildAuthHeaders('application/json'),
      body: JSON.stringify({
        text,
        images: imageUrls,
        reply_to_id,
      }),
    });

    return res.ok;
  } catch (error) {
    console.error(`postToThreads -> error:`, error);
    return false;
  }
};

const loadMyPostsThreads = async (): Promise<Post[]> => {
  try {
    const res = await fetch(`${Config.API_ENDPOINT}/threads_posts`, {
      method: 'POST',
      headers: buildAuthHeaders('application/json'),
      body: JSON.stringify({}),
    });

    if (res.ok) {
      const resJson = await res.json();
      return resJson;
    } else {
      return [];
    }
  } catch (error) {
    console.error(`loadMyPostsThreads -> error:`, error);
    return [];
  }
};


const loadMyPostsBluesky = async (): Promise<Post[]> => {
  try {
    const res = await fetch(`${Config.API_ENDPOINT}/bluesky_posts`, {
      method: 'POST',
      headers: buildAuthHeaders('application/json'),
      body: JSON.stringify({}),
    });

    if (res.ok) {
      const resJson = await res.json();
      return resJson.posts || [];
    } else {
      return [];
    }
  } catch (error) {
    console.error(`loadMyPostsBluesky -> error:`, error);
    return [];
  }
};

const loadMyPostsMastodon = async (): Promise<Post[]> => {
  try {
    const res = await fetch(`${Config.API_ENDPOINT}/mastodon_posts`, {
      method: 'POST',
      headers: buildAuthHeaders('text/plain'),
      body: JSON.stringify({}),
    });

    if (res.ok) {
      const resJson = await res.json();
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
    // session データはサーバーがセッションから復号して使用する
    const res = await fetch(`${Config.API_ENDPOINT}/bluesky_post`, {
      method: 'POST',
      headers: buildAuthHeaders('application/json'),
      body: JSON.stringify({
        text,
        images: imageUrls,
        reply_to_id
      }),
    });

    if (res.ok) {
      const resJson = await res.json();
      console.log(`postToBluesky response:`, resJson);
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
  // ストレージ (R2) に直接アップロード
  return await uploadImageToStorage(content, filename);
}
