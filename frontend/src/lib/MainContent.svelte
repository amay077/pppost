<script lang="ts">
import { onMount } from "svelte";

// @ts-ignore-next-line
import twitterText from "twitter-text";

import BlueskyConnection from "./BlueskyConnection.svelte";
import ThreadsConnection from "./ThreadsConnection.svelte";
import MisskeyConnection from "./MisskeyConnection.svelte";
import { loadMessage, loadPostSetting, loadSessionId, saveMessage, savePostSetting, saveSessionId, type SettingType } from "./func";
import { Config } from "../config";
import { getApiVersion, getSpaVersion, loadMyPosts, postSettings, postTo, postToSns, type Post, type PresentedPost, type ImageData } from "./MainContent"; // .ts 拡張子を削除
import ImagePreview from "./ImagePreview.svelte";
import dayjs from "dayjs";

const built_at = (window as any)['built_at'] ?? '';
let apiVer: { build_at: string, env_ver: string } = { build_at: '', env_ver: '' };
let spaUpdateAvailable = false;
let myPosts: PresentedPost[] =[];

let loading = true;
let loadingMyPosts = false;
let posting = false;
let posted = false;

let text = loadMessage()?.message ?? '';
// let imageDataURLs: string[] = []; // 古い形式は削除
let images: ImageData[] = []; // 新しいデータ構造の配列

let expandedReply = false;
let replyToIdForBluesky = '';
let replyToIdForMisskey = '';
let replyToPost: PresentedPost = {
  display_posted_at: undefined,
  trimmed_text: '',
  postOfType: {
    bluesky: undefined,
    threads: undefined,
    misskey: undefined,
  }
};

// Twitter 文字数カウント
$: tweetLength = twitterText.parseTweet(text).weightedLength / 2; // エクスポートされた名前空間を使用
const TWITTER_WARN_LENGTH = 140; // 現在のTwitterの文字数上限（警告を出す文字数）

// Swarm URLをスクレイピングして投稿テキストを生成する関数
const scrapeSwarmCheckin = async (swarmUrl: string): Promise<boolean> => {
  let handled = false;
  try {
    loading = true;
    const apiUrl = import.meta.env.VITE_API_ENDPOINT || '';
    
    // GETリクエストに変更（よりRESTfulで適切）
    const response = await fetch(`${apiUrl}/foursquare_scrape?url=${encodeURIComponent(swarmUrl)}`);

    if (response.ok) {
      const result = await response.json();
      if (result.success && result.data) {
        // スクレイピング結果の投稿テキストを設定
        text = result.data.postText;
        console.log('Swarm scraping successful:', text);
        handled = true;
      } else {
        console.error('Swarm scraping failed:', result.error);
      }
    } else {
      console.error('Failed to scrape Swarm URL:', response.status);
    }
  } catch (error) {
    console.error('Error scraping Swarm URL:', error);
  } finally {
    loading = false;
  }

  return handled;
};

// テキストから Swarm チェックインのスクレイピング対象 URL を解決する
// 旧形式 (https://(ja.)?swarmapp.com/user/<uid>/checkin/<id>) はそのまま使用する。
// 新形式 (https://app.foursquare.com/share/checkin/<id>) はコンテンツが貧弱なため、
// ja.swarmapp.com/share/checkin/<id> に変換する（欠落する user/<uid> はリダイレクトで補完される）。
const resolveSwarmScrapeUrl = (source: string): string | null => {
  const swarmUserMatch = source.match(
    /https:\/\/(ja\.)?swarmapp\.com\/user\/\d+\/checkin\/[a-zA-Z0-9]+(\?[^\s、〜～]*)?/
  );
  if (swarmUserMatch) {
    return swarmUserMatch[0];
  }

  const foursquareShareMatch = source.match(
    /https:\/\/app\.foursquare\.com\/share\/checkin\/([a-zA-Z0-9]+)(\?[^\s、〜～]*)?/
  );
  if (foursquareShareMatch) {
    const checkinId = foursquareShareMatch[1];
    const query = foursquareShareMatch[2] ? foursquareShareMatch[2] : '';
    return `https://ja.swarmapp.com/share/checkin/${checkinId}${query}`;
  }

  return null;
};

const extractUrlOnly = (value: string | null | undefined): string | null => {
  if (!value) {
    return null;
  }

  const trimmed = value.trim();
  if (trimmed.length === 0) {
    return null;
  }

  const sanitized = trimmed.replace(/[、。，．。,.．〜～\s]+$/gu, '');
  if (/^https?:\/\/\S+$/i.test(sanitized)) {
    return sanitized;
  }

  return null;
};

const fetchTitleForUrl = async (targetUrl: string): Promise<string | null> => {
  const apiUrl = import.meta.env.VITE_API_ENDPOINT || '';

  try {
    loading = true;
    const response = await fetch(`${apiUrl}/fetch_title?url=${encodeURIComponent(targetUrl)}`);

    if (!response.ok) {
      console.warn('Failed to fetch title:', response.status);
      return null;
    }

    const result = await response.json();
    if (result.success && typeof result.title === 'string' && result.title.trim().length > 0) {
      return result.title.trim();
    }

    if (result.error) {
      console.warn('Title API responded with error:', result.error);
    }
  } catch (error) {
    console.error('Error fetching title for URL:', error);
  } finally {
    loading = false;
  }

  return null;
};

onMount(async () => {
  console.log(`onMount`);

  try {

    // const url = new URL(window.location.href);
    // const params = new URLSearchParams(url.search);
    // if (params.get('state') == 'twitter_callback' && params.has('code')) {
    //   await connectToTwitter(params);
    // }

    const urlParams = new URLSearchParams(window.location.search);

    // Threads OAuth コールバック処理
    if (urlParams.get('state') === 'threads_callback' && urlParams.has('code')) {
      const code = urlParams.get('code') ?? '';
      // 既存セッションがあれば再利用する（トークンはサーバー保管、返るのは session_id とメタのみ）
      const existingSessionId = loadSessionId();
      const headers: Record<string, string> = {};
      if (existingSessionId != null) {
        headers['Authorization'] = `Bearer ${existingSessionId}`;
      }
      const res = await fetch(`${Config.API_ENDPOINT}/threads_token?code=${encodeURIComponent(code)}`, { headers });
      if (res.ok) {
        const resJson = await res.json();
        saveSessionId(resJson.session_id);
        savePostSetting({
          type: 'threads',
          title: 'Threads',
          enabled: true,
          user_id: resJson.user_id,
        });
        onChangePostSettings();
      } else {
        console.error(`failed to exchange threads token:`, res);
      }

      // URL から code を除去する
      history.replaceState(null, '', window.location.pathname);
    }

    // Threads 長命トークンの自動リフレッシュ
    // リフレッシュ可否の判定・実行はサーバー側で行うため、接続済みならサーバーへ問い合わせるだけとする
    const threadsSetting = loadPostSetting('threads');
    const sessionId = loadSessionId();
    if (threadsSetting != null && sessionId != null) {
      try {
        const refreshRes = await fetch(`${Config.API_ENDPOINT}/threads_refresh`, {
          headers: { 'Authorization': `Bearer ${sessionId}` },
        });
        if (!refreshRes.ok) {
          console.error(`failed to refresh threads token:`, refreshRes);
        }
      } catch (error) {
        console.error(`failed to refresh threads token:`, error);
      }
    }

    const content = urlParams.get('text');
    const url = urlParams.get('url');
    let queryValueUsed: string | null = null;

    if ((content?.length ?? 0) > 0) {
      text = content ?? '';
      queryValueUsed = content ?? '';
    } else if ((url?.length ?? 0) > 0) {
      text = url ?? '';
      queryValueUsed = url ?? '';
    }

    // Swarm / Foursquare チェックイン URL の検出と自動スクレイピング処理
    // 日本語テキスト内のURLも検出（〜や、で終わる場合を考慮）
    const swarmScrapeUrl = resolveSwarmScrapeUrl(text);
    let swarmHandled = false;

    if (swarmScrapeUrl) {
      console.log('Swarm URL detected:', swarmScrapeUrl);
      console.log('Original text:', text);

      // Swarm URLをスクレイピングして投稿テキストを生成
      swarmHandled = await scrapeSwarmCheckin(swarmScrapeUrl);
    }

    if (!swarmHandled && queryValueUsed) {
      const plainUrl = extractUrlOnly(queryValueUsed);
      if (plainUrl) {
        const title = await fetchTitleForUrl(plainUrl);
        if (title) {
          text = `${title} - ${plainUrl}`;
          console.log('Title fetched for URL:', text);
        }
      }
    }

  } finally {
    loading = false;
  }
});    

const onTextChange = () => {
  saveMessage({ message: text });
}

// Web Share API による共有
const webShareSupported = typeof navigator !== 'undefined' && typeof navigator.share === 'function';
const shareContent = async () => {
  try {
    // 選択中の全画像を File 化
    const files: File[] = [];
    for (let i = 0; i < images.length; i++) {
      const url = images[i].croppedUrl ?? images[i].originalUrl;
      const res = await fetch(url);
      const blob = await res.blob();
      const ext = blob.type.split('/')[1] ?? 'png';
      files.push(new File([blob], `image_${i + 1}.${ext}`, { type: blob.type }));
    }

    const shareData: ShareData = { text };
    // ファイル共有に対応している場合のみ files を含める（非対応時はテキストのみ）
    if (files.length > 0 && typeof navigator.canShare === 'function' && navigator.canShare({ files })) {
      shareData.files = files;
    }

    await navigator.share(shareData);
  } catch (error) {
    // ユーザーが共有シートをキャンセルした場合はエラー表示しない
    if (error instanceof Error && error.name === 'AbortError') {
      return;
    }
    console.error('shareContent -> error:', error);
    alert('共有に失敗しました。');
  }
}

// テキストのクリップボードコピー
let textCopyState: 'idle' | 'success' | 'fail' = 'idle';
let textCopyTimer: ReturnType<typeof setTimeout> | undefined;
const copyText = async () => {
  try {
    if (!navigator.clipboard || !navigator.clipboard.writeText) {
      throw new Error('Clipboard API is unavailable');
    }
    await navigator.clipboard.writeText(text);
    textCopyState = 'success';
  } catch (error) {
    console.error('copyText -> error:', error);
    textCopyState = 'fail';
  } finally {
    if (textCopyTimer) clearTimeout(textCopyTimer);
    textCopyTimer = setTimeout(() => { textCopyState = 'idle'; }, 2000);
  }
}

const post = async () => {

  try {
    posting = true;

    const getPostId = (url: string) => {
      if ((url?.length ?? 0) == 0) {
        return '';
      }

      // URL の形をとらない入力（投稿 ID の直接入力）はそのまま ID として扱う。
      // new URL() の例外を握り潰すと post() の catch により全 SNS の投稿が無言で中断するため。
      try {
        const urlObj = new URL(url);
        const pathParts = urlObj.pathname.split('/');
        return pathParts[pathParts.length - 1];
      } catch {
        return url.trim();
      }
    };
  
    // 送信する画像URLリストを作成 (croppedUrlがあれば優先、なければoriginalUrl)
    const urlsToPost = images.map(img => img.croppedUrl ?? img.originalUrl);

    const res = await postToSns(text, urlsToPost, { reply_to_ids: {
      bluesky: getPostId(replyToPost?.postOfType['bluesky']?.url ?? replyToIdForBluesky),
      // Threads は permalink 末尾がショートコードで API の投稿 ID と異なるため、
      // getPostId は使わず取得済みの id をそのまま使用する（design.md D1）
      threads: replyToPost?.postOfType['threads']?.id ?? '',
      misskey: getPostId(replyToPost?.postOfType['misskey']?.url ?? replyToIdForMisskey),
    } });

    if (res.errors.length == 0) {
      replyToIdForBluesky = '';
      replyToIdForMisskey = '';
      replyToPost = {
        display_posted_at: undefined,
        trimmed_text: '',
        postOfType: {
          bluesky: undefined,
          threads: undefined,
          misskey: undefined,
        }
      };
      posted = true;
      alert('投稿しました。');
    } else {
      alert(`${res.errors.join(', ')}に投稿できませんでした。`);
    }

  } catch (error) {
    
  } finally {
    posting = false;
  }
}

const onChangePostSettings = () => {
  postSettings.bluesky = loadPostSetting('bluesky');
  postSettings.threads = loadPostSetting('threads');
  postSettings.misskey = loadPostSetting('misskey');

  Object.entries(postTo).forEach(([k, v]) => {
    postTo[k as SettingType] = postSettings?.[k as SettingType]?.enabled ?? false;
  });
};

const onVersion = async () => { 
  apiVer = await getApiVersion();
  const spaVer = await getSpaVersion();
  spaUpdateAvailable = built_at.length > 0 && spaVer != null && spaVer.built_at > built_at;
}

const onUpdateSpa = () => {
  location.href = location.pathname + '?v=' + Date.now();
}

const onLoadMyPosts = async () => {
  myPosts = [];
  loadingMyPosts = true;
  try {
    myPosts = await loadMyPosts();
  } finally {
    loadingMyPosts = false;
  }
}

const getTypes = (post: PresentedPost) => {
  // console.log(`FIXME h_oku 後で消す  -> getTypes -> post:`, post);
  const types = Object.entries(post.postOfType).filter(([k, v]) => v != null).map(([k, v]) => k);
  return types.length > 0 ? `(${types.join(', ')})` : '';
}

</script>

{#if loading}
<span class="loading">loading..</span>
{:else}

<div class="d-flex flex-column gap-2">
  <div class="form-check mb-0 d-flex flex-row align-items-start gap-1">
    <input class="mt-1 form-check-input" type="checkbox" bind:checked={postTo.bluesky} id="bluesky" disabled={postSettings.bluesky == null}>
    <div class="w-100">
      <BlueskyConnection on:onChange={onChangePostSettings} />
    </div>
  </div>
  <div class="form-check mb-0 d-flex flex-row align-items-start gap-1">
    <input class="mt-1 form-check-input" type="checkbox" bind:checked={postTo.threads} id="threads" disabled={postSettings.threads == null}>
    <div class="w-100">
      <ThreadsConnection on:onChange={onChangePostSettings} />
    </div>
  </div>
  <div class="form-check mb-0 d-flex flex-row align-items-start gap-1">
    <input class="mt-1 form-check-input" type="checkbox" bind:checked={postTo.misskey} id="misskey" disabled={postSettings.misskey == null}>
    <div class="w-100">
      <MisskeyConnection on:onChange={onChangePostSettings} />
    </div>
  </div>
</div>

<div class="mt-4">

  <div class="mb-3">
    <div class="d-flex justify-content-between align-items-center"> <!-- Message ラベルと文字数を両端に配置 -->
      <span class="h5">Message:</span>
      <span class:text-danger={tweetLength > TWITTER_WARN_LENGTH}> <!-- 文字数表示エリア -->
        {tweetLength} / {TWITTER_WARN_LENGTH} 文字
      </span>
    </div>
    <textarea
      class="form-control" 
      id="message" 
      rows="5" 
      bind:value={text} 
      on:change={() => onTextChange()}
      disabled={posting}
    ></textarea>
  </div>
  <div class="d-flex justify-content-between align-items-center"> <!-- ボタンと文字数を横並びにするための div -->
    <div class="d-flex flex-row gap-2"> <!-- ボタンを左寄せするための div -->
    <button class="btn btn-primary" on:click="{() => post()}" disabled={posting || posted || text.length <= 0 || Array.from(Object.values(postTo)).every(x => !x)}>

    {#if posting}
    <div class="spinner-border spinner-border-sm" role="status">
      <span class="visually-hidden">Loading...</span>
    </div>
    <span>Posting...</span>
    {:else}
    <div class="d-flex flex-row align-items-center gap-1">
      {#if postSettings.bluesky != null && postTo.bluesky}
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 -3.268 64 68.414" width="16" height="16"><path fill="currentColor" d="M13.873 3.805C21.21 9.332 29.103 20.537 32 26.55v15.882c0-.338-.13.044-.41.867-1.512 4.456-7.418 21.847-20.923 7.944-7.111-7.32-3.819-14.64 9.125-16.85-7.405 1.264-15.73-.825-18.014-9.015C1.12 23.022 0 8.51 0 6.55 0-3.268 8.579-.182 13.873 3.805zm36.254 0C42.79 9.332 34.897 20.537 32 26.55v15.882c0-.338.13.044.41.867 1.512 4.456 7.418 21.847 20.923 7.944 7.111-7.32 3.819-14.64-9.125-16.85 7.405 1.264 15.73-.825 18.014-9.015C62.88 23.022 64 8.51 64 6.55c0-9.818-8.578-6.732-13.873-2.745z"/></svg>
      {/if}
      {#if postSettings.threads != null && postTo.threads}
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 192 192" width="16" height="16"><path fill="currentColor" d="M141.537 88.988a66.667 66.667 0 0 0-2.518-1.143c-1.482-27.307-16.403-42.94-41.457-43.1h-.34c-14.986 0-27.449 6.396-35.12 18.036l13.779 9.452c5.73-8.695 14.724-10.548 21.348-10.548h.229c8.249.053 14.474 2.452 18.503 7.129 2.932 3.405 4.893 8.111 5.864 14.05-7.314-1.243-15.224-1.626-23.68-1.14-23.82 1.371-39.134 15.264-38.105 34.568.522 9.792 5.4 18.216 13.735 23.719 7.047 4.652 16.124 6.927 25.557 6.412 12.458-.683 22.231-5.436 29.049-14.127 5.178-6.6 8.453-15.153 9.899-25.93 5.937 3.583 10.337 8.298 12.767 13.966 4.132 9.635 4.373 25.468-8.546 38.376-11.319 11.308-24.925 16.2-45.488 16.351-22.809-.169-40.06-7.484-51.275-21.742C35.236 139.966 29.808 120.682 29.605 96c.203-24.682 5.63-43.966 16.133-57.317C56.954 24.425 74.204 17.11 97.013 16.94c22.975.17 40.526 7.52 52.171 21.847 5.71 7.026 10.015 15.86 12.853 26.162l16.147-4.308c-3.44-12.68-8.853-23.606-16.219-32.668C147.036 9.607 124.999.195 97.07 0h-.113C69.087.194 47.295 9.642 32.32 28.08 18.994 44.485 12.12 67.315 11.89 95.932L11.89 96l.001.067c.23 28.617 7.104 51.448 20.43 67.853C47.295 182.358 69.087 191.806 96.957 192h.113c24.78-.172 42.236-6.652 56.61-21.019 18.806-18.788 18.24-42.343 12.05-56.78-4.441-10.359-12.91-18.769-24.493-24.319l.3.106Z"/></svg>
      {/if}
      {#if postSettings.misskey != null && postTo.misskey}
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="16" height="16"><path fill="currentColor" d="M8.91076 16.8915c-1.03957.0038-1.93213-.6294-2.35267-1.366-.22516-.3217-.66989-.4364-.6761 0v2.0148c0 .8094-.29152 1.5097-.87581 2.1002-.56755.573-1.25977.8595-2.0779.8595-.80014 0-1.49298-.2865-2.07727-.8601C.28408 19.05 0 18.3497 0 17.5403V6.45968c0-.62378.17553-1.18863.52599-1.69455.36657-.52284.83426-.88582 1.4018-1.08769a2.84574 2.84574 0 0 1 1.00049-.17742c.90125 0 1.65239.35421 2.25281 1.06262l2.99713 3.51572c.06699.05016.263.43696.73192.43696.47016 0 .6916-.3868.75796-.43758l2.9717-3.5151c.6178-.70841 1.377-1.06262 2.2782-1.06262.3337 0 .6675.05893 1.0012.17742.5669.20187 1.0259.56422 1.377 1.08769.3665.50592.5501 1.07077.5501 1.69455V17.5403c0 .8094-.2915 1.5097-.8758 2.1002-.5675.573-1.2604.8595-2.0779.8595-.8008 0-1.493-.2865-2.0779-.8601-.5669-.5899-.8504-1.2902-.8504-2.0996v-2.0148c-.0496-.5499-.5303-.2032-.7009 0-.4503.8431-1.31369 1.3616-2.35264 1.366ZM21.447 8.60998c-.7009 0-1.3015-.24449-1.8019-.73348-.4838-.50571-.7257-1.11277-.7257-1.82118s.2419-1.30711.7257-1.79611c.5004-.50571 1.101-.75856 1.8019-.75856.7009 0 1.3017.25285 1.8025.75856.5003.489.7505 1.0877.7505 1.79611 0 .70841-.2502 1.31547-.7505 1.82118-.5008.48899-1.1016.73348-1.8025.73348Zm.0248.50655c.7009 0 1.2935.25285 1.7777.75856.5003.50571.7505 1.11301.7505 1.82181v6.2484c0 .7084-.2502 1.3155-.7505 1.8212-.4838.489-1.0764.7335-1.7777.7335-.7005 0-1.3011-.2445-1.8019-.7335-.5003-.5057-.7505-1.1128-.7505-1.8212v-6.2484c0-.7084.2502-1.3157.7505-1.82181.5004-.50571 1.101-.75856 1.8019-.75856Z"/></svg>
      {/if}
      <span>Post</span>
    </div>
    {/if}

  </button>

  <button class="btn btn-primary-outline" on:click="{() => {
    text = '';
    images = []; // 画像データをクリア
    replyToIdForBluesky = '';
    replyToIdForMisskey = '';
    replyToPost = {
      display_posted_at: undefined,
      trimmed_text: '',
      postOfType: {
        bluesky: undefined,
        threads: undefined,
        misskey: undefined,
      }
    };
    posted = false;
    onTextChange();
  }}" disabled={text.length <= 0 && images.length <= 0}>
    Clear
    </button>

    <button
      class="btn {textCopyState === 'success' ? 'btn-success' : textCopyState === 'fail' ? 'btn-danger' : 'btn-outline-secondary'} d-flex align-items-center"
      on:click={() => copyText()}
      disabled={text.length <= 0}
      aria-label={textCopyState === 'success' ? 'コピーしました' : textCopyState === 'fail' ? 'コピー失敗' : 'テキストをコピー'}
      title={textCopyState === 'success' ? 'コピーしました' : textCopyState === 'fail' ? 'コピー失敗' : 'テキストをコピー'}
    >
      {#if textCopyState === 'success'}
      <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" class="bi bi-check-lg" viewBox="0 0 16 16">
        <path d="M12.736 3.97a.733.733 0 0 1 1.047 0c.286.289.29.756.01 1.05L7.88 12.01a.733.733 0 0 1-1.065.02L3.217 8.384a.757.757 0 0 1 0-1.06.733.733 0 0 1 1.047 0l3.052 3.093 5.4-6.425a.247.247 0 0 1 .02-.022Z"/>
      </svg>
      {:else if textCopyState === 'fail'}
      <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" class="bi bi-x-lg" viewBox="0 0 16 16">
        <path d="M2.146 2.854a.5.5 0 1 1 .708-.708L8 7.293l5.146-5.147a.5.5 0 0 1 .708.708L8.707 8l5.147 5.146a.5.5 0 0 1-.708.708L8 8.707l-5.146 5.147a.5.5 0 0 1-.708-.708L7.293 8 2.146 2.854Z"/>
      </svg>
      {:else}
      <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" class="bi bi-clipboard" viewBox="0 0 16 16">
        <path d="M4 1.5H3a2 2 0 0 0-2 2V14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V3.5a2 2 0 0 0-2-2h-1v1h1a1 1 0 0 1 1 1V14a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V3.5a1 1 0 0 1 1-1h1v-1z"/>
        <path d="M9.5 1a.5.5 0 0 1 .5.5v1a.5.5 0 0 1-.5.5h-3a.5.5 0 0 1-.5-.5v-1a.5.5 0 0 1 .5-.5h3zm-3-1A1.5 1.5 0 0 0 5 1.5v1A1.5 1.5 0 0 0 6.5 4h3A1.5 1.5 0 0 0 11 2.5v-1A1.5 1.5 0 0 0 9.5 0h-3z"/>
      </svg>
      {/if}
    </button>

    {#if webShareSupported}
    <button
      class="btn btn-outline-primary d-flex align-items-center"
      on:click={() => shareContent()}
      disabled={text.length <= 0 && images.length <= 0}
      aria-label="共有"
      title="共有"
    >
      <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" class="bi bi-share" viewBox="0 0 16 16">
        <path d="M13.5 1a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3zM11 2.5a2.5 2.5 0 1 1 .603 1.628l-6.718 3.12a2.499 2.499 0 0 1 0 1.504l6.718 3.12a2.5 2.5 0 1 1-.488.876l-6.718-3.12a2.5 2.5 0 1 1 0-3.256l6.718-3.12A2.5 2.5 0 0 1 11 2.5z"/>
      </svg>
    </button>
    {/if}

    </div> <!-- ボタン左寄せ div 閉じタグ -->
  </div> <!-- ボタン横並び div 閉じタグ -->

</div>

<div class="mt-4 d-flex flex-column align-items-start gap-1">
  <!-- svelte-ignore a11y-click-events-have-key-events -->
  <!-- svelte-ignore a11y-no-static-element-interactions -->
  <div class="d-flex flex-row align-items-center gap-1" style="cursor: pointer;"  on:click={async () => {
    expandedReply = !expandedReply;
    // Reply展開時に毎回投稿を再読み込み（洗い替え）
    if (expandedReply && !loadingMyPosts) {
      await onLoadMyPosts();
    }
  }}>
  
    <span class="h5">Reply:</span>
    <div class="d-flex flex-row gap-1 align-items-center">
    {#if !expandedReply}
    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" fill="currentColor" class="bi bi-chevron-right" viewBox="0 0 16 16">
      <path fill-rule="evenodd" d="M4.646 1.646a.5.5 0 0 1 .708 0l6 6a.5.5 0 0 1 0 .708l-6 6a.5.5 0 0 1-.708-.708L10.293 8 4.646 2.354a.5.5 0 0 1 0-.708z"/>
    </svg>
    {:else}
    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" fill="currentColor" class="bi bi-chevron-down" viewBox="0 0 16 16">
      <path fill-rule="evenodd" d="M1.646 4.646a.5.5 0 0 1 .708 0L8 10.293l5.646-5.647a.5.5 0 0 1 .708.708l-6 6a.5.5 0 0 1-.708 0l-6-6a.5.5 0 0 1 0-.708z"/>
    </svg>
    {/if}
    {#if loadingMyPosts}
    <div class="spinner-border spinner-border-sm" role="status">
      <span class="visually-hidden">Loading...</span>
    </div>
    {/if}

    </div>
  </div>

  {#if expandedReply}

  <select class="form-select form-select-sm" bind:value={replyToPost}>
    <option>Manual reply</option>
    {#each myPosts as post}
    <option value={post}>{post.display_posted_at} - {post.trimmed_text} {getTypes(post)}</option>
    {/each}
  </select>

  {#if replyToPost.display_posted_at == undefined}

  <div class="my-2"> - OR - </div>

  {#if postSettings.bluesky != null && postTo.bluesky}            
  <div style="width: 100%;" class="d-flex flex-row align-items-center gap-1">
    <svg style="width: 18px;" xmlns="http://www.w3.org/2000/svg" viewBox="0 -3.268 64 68.414" width="16" height="16"><path fill="currentColor" d="M13.873 3.805C21.21 9.332 29.103 20.537 32 26.55v15.882c0-.338-.13.044-.41.867-1.512 4.456-7.418 21.847-20.923 7.944-7.111-7.32-3.819-14.64 9.125-16.85-7.405 1.264-15.73-.825-18.014-9.015C1.12 23.022 0 8.51 0 6.55 0-3.268 8.579-.182 13.873 3.805zm36.254 0C42.79 9.332 34.897 20.537 32 26.55v15.882c0-.338.13.044.41.867 1.512 4.456 7.418 21.847 20.923 7.944 7.111-7.32 3.819-14.64-9.125-16.85 7.405 1.264 15.73-.825 18.014-9.015C62.88 23.022 64 8.51 64 6.55c0-9.818-8.578-6.732-13.873-2.745z"/></svg>
    <input class="form-control" type="text" placeholder="Post URL or ID" bind:value={replyToIdForBluesky}  />
  </div>
  {/if}

  {#if postSettings.misskey != null && postTo.misskey}
  <div style="width: 100%;" class="d-flex flex-row align-items-center gap-1">
    <svg style="width: 18px;" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="16" height="16"><path fill="currentColor" d="M8.91076 16.8915c-1.03957.0038-1.93213-.6294-2.35267-1.366-.22516-.3217-.66989-.4364-.6761 0v2.0148c0 .8094-.29152 1.5097-.87581 2.1002-.56755.573-1.25977.8595-2.0779.8595-.80014 0-1.49298-.2865-2.07727-.8601C.28408 19.05 0 18.3497 0 17.5403V6.45968c0-.62378.17553-1.18863.52599-1.69455.36657-.52284.83426-.88582 1.4018-1.08769a2.84574 2.84574 0 0 1 1.00049-.17742c.90125 0 1.65239.35421 2.25281 1.06262l2.99713 3.51572c.06699.05016.263.43696.73192.43696.47016 0 .6916-.3868.75796-.43758l2.9717-3.5151c.6178-.70841 1.377-1.06262 2.2782-1.06262.3337 0 .6675.05893 1.0012.17742.5669.20187 1.0259.56422 1.377 1.08769.3665.50592.5501 1.07077.5501 1.69455V17.5403c0 .8094-.2915 1.5097-.8758 2.1002-.5675.573-1.2604.8595-2.0779.8595-.8008 0-1.493-.2865-2.0779-.8601-.5669-.5899-.8504-1.2902-.8504-2.0996v-2.0148c-.0496-.5499-.5303-.2032-.7009 0-.4503.8431-1.31369 1.3616-2.35264 1.366ZM21.447 8.60998c-.7009 0-1.3015-.24449-1.8019-.73348-.4838-.50571-.7257-1.11277-.7257-1.82118s.2419-1.30711.7257-1.79611c.5004-.50571 1.101-.75856 1.8019-.75856.7009 0 1.3017.25285 1.8025.75856.5003.489.7505 1.0877.7505 1.79611 0 .70841-.2502 1.31547-.7505 1.82118-.5008.48899-1.1016.73348-1.8025.73348Zm.0248.50655c.7009 0 1.2935.25285 1.7777.75856.5003.50571.7505 1.11301.7505 1.82181v6.2484c0 .7084-.2502 1.3155-.7505 1.8212-.4838.489-1.0764.7335-1.7777.7335-.7005 0-1.3011-.2445-1.8019-.7335-.5003-.5057-.7505-1.1128-.7505-1.8212v-6.2484c0-.7084.2502-1.3157.7505-1.82181.5004-.50571 1.101-.75856 1.8019-.75856Z"/></svg>
    <input class="form-control" type="text" placeholder="Note URL or ID" bind:value={replyToIdForMisskey}  />
  </div>
  {/if}
  {/if}
  {/if}

</div>

<div class="mt-4">
  <ImagePreview
    bind:images={images}
  />

</div>

{/if}

<div class="mt-4 d-flex flex-column align-items-end" style="font-size: 90%;">
  <button class="btn btn-sm btn-block btn-link"
    on:click={onVersion}
  >version</button>
  {#if apiVer.env_ver?.length > 0}
  <span>spa_build: {built_at}</span>
  {#if spaUpdateAvailable}
  <button class="btn btn-sm btn-link" on:click={onUpdateSpa}>更新</button>
  {/if}
  <span>api_build: {apiVer.build_at}</span>
  <span>api_ver: {apiVer.env_ver}</span>
  {/if}
</div>
