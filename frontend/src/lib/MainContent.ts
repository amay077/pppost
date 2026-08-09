import { Config } from "../config";
import { type SettingDataBluesky, type SettingDataThreads, type SettingDataMisskey, loadPostSetting, type SettingType, loadMessage, savePostSetting, loadSessionId } from "./func";
import dayjs from "dayjs";
import { uploadBlobToStorage, uploadImageToStorage } from "./storage-client";

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
  bluesky: SettingDataBluesky | null,
  threads: SettingDataThreads | null,
  misskey: SettingDataMisskey | null,
} = {
  bluesky: loadPostSetting('bluesky'),
  threads: loadPostSetting('threads'),
  misskey: loadPostSetting('misskey'),
};

export const postTo: { [K in SettingType]: boolean } = {
  bluesky: postSettings?.bluesky?.enabled ?? false,
  threads: postSettings?.threads?.enabled ?? false,
  misskey: postSettings?.misskey?.enabled ?? false,
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

export async function getSpaVersion(): Promise<{ built_at: string } | null> {

  try {
    const res = await fetch(`version.json?v=${Date.now()}`);

    if (res.ok) {
      return await res.json();
    } else {
      return null;
    }
  } catch (error) {
    console.error(`getSpaVersion -> error:`, error);
    return null;
  }
}

export const loadMyPosts = async (): Promise<PresentedPost[]> => {

  const enableTypes = Array.from(Object.entries(postTo)).filter(([_, v]) => v).map(([k, v]) => (k as SettingType));

  const promises = [];
  
  for (const type of enableTypes) {
    switch (type) {
    case 'bluesky':
      promises.push(loadMyPostsBluesky().then(posts => ({ type: 'bluesky', posts })));
      break;
    case 'threads':
      promises.push(loadMyPostsThreads().then(posts => ({ type: 'threads', posts })));
      break;
    case 'misskey':
      promises.push(loadMyPostsMisskey().then(posts => ({ type: 'misskey', posts })));
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

    // ハッシュタグの # 記号を除去
    // Threads は # をカテゴリ化して投稿文から # のみ削除するため、比較キーから # を除外する
    // （キーワード自体は残す。URL 除去が先行するので URL のフラグメント # と衝突しない）
    normalized = normalized.replace(/#(?=[\p{L}\p{N}_])/gu, '');

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
    // 本文が一致していても投稿時刻が離れていれば別グループとする。
    // URL を除去した正規化により、同じ場所への再訪時のチェックイン投稿などは
    // 内容が完全一致するため、時刻を見ないと時期の異なる投稿まで 1 つに潰れてしまう。
    // 同一内容の複数 SNS 同時投稿は数秒〜数分差で届くため、1 時間の窓なら分裂しない。
    const GROUP_WINDOW_MS = 60 * 60 * 1000;

    // 本文キー → 時刻の異なるグループの配列
    const buckets: { [textKey: string]: { group: PresentedPost, times: number[] }[] } = {};

    input.forEach(({ type, post }, index) => {
      const textKey = normalizedTexts[index].substring(0, compareLength);
      const postedAt = dayjs(post.posted_at).valueOf();
      const list = buckets[textKey] ?? (buckets[textKey] = []);

      let entry = list.find(e => e.times.some(t => Math.abs(t - postedAt) <= GROUP_WINDOW_MS));
      if (entry == null) {
        entry = {
          group: {
            display_posted_at: dayjs(post.posted_at).format('M/DD H:mm'),
            trimmed_text: trimText(post.text),
            postOfType: { bluesky: undefined, threads: undefined, misskey: undefined }
          },
          times: [],
        };
        list.push(entry);
      }
      entry.times.push(postedAt);
      entry.group.postOfType[type] = post;
    });

    // グループへ取り込んだ全投稿の最新日時を代表値として降順ソートする
    // （SNS ごとに連結された順のままだと Threads 分が末尾に残るため）。
    // postOfType は同一 SNS の後着で上書きされうるので、ソートキーには使わない。
    return Object.values(buckets).flat()
      .sort((a, b) => Math.max(...b.times) - Math.max(...a.times))
      .map(e => e.group);
  }
  
  const result = groupByText(succeededPosts ?? []);
  console.log(result);

  return result;
}

export const postToSns = async (text: string, imageDataURLs: string[], options: {
  reply_to_ids: {
    bluesky: string,
    threads: string,
    misskey: string,
  },
  quote_to_ids: {
    bluesky: string,
    threads: string,
    misskey: string,
  },
}, video: File | null = null): Promise<{ errors: string[] }> => {
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

  // 動画を一度だけストレージ (R2) にアップロード（動画は画像と排他のため、ここではどちらか一方のみ）
  // アップロードに失敗した場合は全 SNS への投稿を中止する
  let uploadedVideoUrl: string | null = null;
  if (video != null) {
    const ext = video.name.split('.').pop()?.toLowerCase() || 'mp4';
    const videoUrl = await uploadBlobToStorage(video, `video_1.${ext}`);
    if (videoUrl == null) {
      console.error('Failed to upload video');
      return { errors: ['動画のアップロードに失敗しました'] };
    }
    uploadedVideoUrl = videoUrl;
  }

  const enableTypes = Array.from(Object.entries(postTo)).filter(([_, v]) => v).map(([k, v]) => (k as SettingType));

  const promises = [];
  
  for (const type of enableTypes) {
    switch (type) {
    case 'bluesky':
      promises.push(postToBluesky(text, uploadedImageUrls, uploadedVideoUrl, options?.reply_to_ids?.bluesky, options?.quote_to_ids?.bluesky).then((r) => { if (!r) errors.push('Bluesky') }));
      break;
    case 'threads':
      promises.push(postToThreads(text, uploadedImageUrls, uploadedVideoUrl, options?.reply_to_ids?.threads, options?.quote_to_ids?.threads).then((r) => { if (!r) errors.push('Threads') }));
      break;
    case 'misskey':
      promises.push(postToMisskey(text, uploadedImageUrls, uploadedVideoUrl, options?.reply_to_ids?.misskey, options?.quote_to_ids?.misskey).then((r) => { if (!r) errors.push('Misskey') }));
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


const postToMisskey = async (text: string, imageUrls: string[], videoUrl: string | null, reply_to_id: string, quote_to_id: string): Promise<boolean> => {
  try {
    // host / token はサーバーがセッションから復号して使用するため、クライアントは送らない
    const res = await fetch(`${Config.API_ENDPOINT}/misskey_post`, {
      method: 'POST',
      headers: buildAuthHeaders('application/json'),
      body: JSON.stringify({
        text,
        images: imageUrls,
        video: videoUrl,
        reply_to_id,
        quote_to_id
      }),
    });

    // 202 Accepted も res.ok が true になるため、ステータス判定は 202 を先に確認する
    // 動画は drive/files/upload-from-url で非同期に取り込まれるため、202 + video_url が返る。
    // 取り込み完了 → ノート作成を misskey_video_finalize へのポーリングで行う。
    if (res.status === 202) {
      const { video_url } = await res.json();
      return await finalizeMisskeyVideo(text, video_url);
    }

    return res.ok;
  } catch (error) {
    console.error(`postToMisskey -> error:`, error);
    return false;
  }
};

// misskey_post が 202（動画の drive 取り込み中）を返した場合の最終化ポーリング。
// 取り込み完了後に misskey_video_finalize がノートを作成し、200 が返ったら true。
const finalizeMisskeyVideo = async (text: string, video_url: string): Promise<boolean> => {
  const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
  const FINALIZE_POLL_MAX_ATTEMPTS = 20; // 3 秒間隔で最大 60 秒待つ
  const FINALIZE_POLL_INTERVAL_MS = 3000;

  for (let i = 0; i < FINALIZE_POLL_MAX_ATTEMPTS; i++) {
    await sleep(FINALIZE_POLL_INTERVAL_MS);
    try {
      const res = await fetch(`${Config.API_ENDPOINT}/misskey_video_finalize`, {
        method: 'POST',
        headers: buildAuthHeaders('application/json'),
        body: JSON.stringify({
          text,
          video_url,
        }),
      });

      // 202 Accepted も res.ok が true になるため、ステータス判定は 202 を先に確認する
      if (res.status === 202) {
        // まだ取り込み・処理中: 再ポーリング
        continue;
      }
      if (res.ok) {
        return true;
      }
      console.error(`misskey_video_finalize failed: ${res.status}`, await res.text());
      return false;
    } catch (error) {
      console.error(`finalizeMisskeyVideo -> error:`, error);
      return false;
    }
  }

  console.error('misskey video finalize timed out');
  return false;
};

const loadMyPostsMisskey = async (): Promise<Post[]> => {
  try {
    const res = await fetch(`${Config.API_ENDPOINT}/misskey_posts`, {
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
    console.error(`loadMyPostsMisskey -> error:`, error);
    return [];
  }
};


const postToThreads = async (text: string, imageUrls: string[], videoUrl: string | null, reply_to_id?: string, quote_to_id?: string): Promise<boolean> => {
  try {
    // トークンはサーバーがセッションから復号して使用する
    const res = await fetch(`${Config.API_ENDPOINT}/threads_post`, {
      method: 'POST',
      headers: buildAuthHeaders('application/json'),
      body: JSON.stringify({
        text,
        images: imageUrls,
        video: videoUrl,
        reply_to_id,
        quote_to_id,
      }),
    });

    // 202 Accepted も res.ok が true になるため、ステータス判定は 202 を先に確認する
    // 動画コンテナの処理が完了していない場合は 202 + creation_id が返る。
    // 処理完了待ち → 公開を threads_video_finalize へのポーリングで行う。
    if (res.status === 202) {
      const { creation_id } = await res.json();
      return await finalizeThreadsVideo(text, videoUrl, creation_id);
    }

    if (res.ok) {
      return true;
    }

    return false;
  } catch (error) {
    console.error(`postToThreads -> error:`, error);
    return false;
  }
};

// threads_post が 202（動画コンテナ処理中）を返した場合の最終化ポーリング。
// コンテナが FINISHED になるまで threads_video_finalize を呼び続け、公開が完了したら true を返す。
const finalizeThreadsVideo = async (text: string, videoUrl: string | null, creation_id: string): Promise<boolean> => {
  const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
  const FINALIZE_POLL_MAX_ATTEMPTS = 20; // 3 秒間隔で最大 60 秒待つ
  const FINALIZE_POLL_INTERVAL_MS = 3000;

  for (let i = 0; i < FINALIZE_POLL_MAX_ATTEMPTS; i++) {
    await sleep(FINALIZE_POLL_INTERVAL_MS);
    try {
      const res = await fetch(`${Config.API_ENDPOINT}/threads_video_finalize`, {
        method: 'POST',
        headers: buildAuthHeaders('application/json'),
        body: JSON.stringify({
          creation_id,
          text,
          video_url: videoUrl,
        }),
      });

      // 202 Accepted も res.ok が true になるため、ステータス判定は 202 を先に確認する
      if (res.status === 202) {
        // まだ処理中: 再ポーリング
        continue;
      }
      if (res.ok) {
        return true;
      }
      console.error(`threads_video_finalize failed: ${res.status}`, await res.text());
      return false;
    } catch (error) {
      console.error(`finalizeThreadsVideo -> error:`, error);
      return false;
    }
  }

  console.error('threads video finalize timed out');
  return false;
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

const postToBluesky = async (text: string, imageUrls: string[], videoUrl: string | null, reply_to_id: string, quote_to_id: string): Promise<boolean> => {
  try {
    // session データはサーバーがセッションから復号して使用する
    const res = await fetch(`${Config.API_ENDPOINT}/bluesky_post`, {
      method: 'POST',
      headers: buildAuthHeaders('application/json'),
      body: JSON.stringify({
        text,
        images: imageUrls,
        video: videoUrl,
        reply_to_id,
        quote_to_id
      }),
    });

    // 202 Accepted も res.ok が true になるため、ステータス判定は 202 を先に確認する
    // 動画のエンコード処理中は 202 + job_id が返る。処理完了待ち → 投稿を
    // bluesky_video_finalize へのポーリングで行う。
    if (res.status === 202) {
      const { job_id } = await res.json();
      return await finalizeBlueskyVideo(text, job_id);
    }

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

// bluesky_post が 202（動画エンコード処理中）を返した場合の最終化ポーリング。
// 処理完了後に bluesky_video_finalize が投稿し、200 が返ったら true。
const finalizeBlueskyVideo = async (text: string, job_id: string): Promise<boolean> => {
  const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
  const FINALIZE_POLL_MAX_ATTEMPTS = 20; // 3 秒間隔で最大 60 秒待つ
  const FINALIZE_POLL_INTERVAL_MS = 3000;

  for (let i = 0; i < FINALIZE_POLL_MAX_ATTEMPTS; i++) {
    await sleep(FINALIZE_POLL_INTERVAL_MS);
    try {
      const res = await fetch(`${Config.API_ENDPOINT}/bluesky_video_finalize`, {
        method: 'POST',
        headers: buildAuthHeaders('application/json'),
        body: JSON.stringify({
          job_id,
          text,
        }),
      });

      // 202 Accepted も res.ok が true になるため、ステータス判定は 202 を先に確認する
      if (res.status === 202) {
        // まだ処理中: 再ポーリング
        continue;
      }
      if (res.ok) {
        return true;
      }
      console.error(`bluesky_video_finalize failed: ${res.status}`, await res.text());
      return false;
    } catch (error) {
      console.error(`finalizeBlueskyVideo -> error:`, error);
      return false;
    }
  }

  console.error('bluesky video finalize timed out');
  return false;
};


const uploadImage = async (content: string, filename: string = 'image.png'): Promise<string | null> => {
  // ストレージ (R2) に直接アップロード
  return await uploadImageToStorage(content, filename);
}
