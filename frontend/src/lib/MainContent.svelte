<script lang="ts">
import { onMount } from "svelte";

// @ts-ignore-next-line
import twitterText from "twitter-text";

import MastodonConnection from "./MastodonConnection.svelte";
import BlueskyConnection from "./BlueskyConnection.svelte";
import { loadMessage, loadPostSetting, saveMessage, type SettingType } from "./func";
import { getApiVersion, loadMyPosts, postSettings, postTo, postToSns, type Post, type PresentedPost, type ImageData } from "./MainContent"; // .ts 拡張子を削除
import ImagePreview from "./ImagePreview.svelte";
import dayjs from "dayjs";

const built_at = (window as any)['built_at'] ?? '';
let apiVer: { build_at: string, env_ver: string } = { build_at: '', env_ver: '' };
let myPosts: PresentedPost[] =[];

let loading = true;
let loadingMyPosts = false;
let posting = false;
let posted = false;

let text = loadMessage()?.message ?? '';
// let imageDataURLs: string[] = []; // 古い形式は削除
let images: ImageData[] = []; // 新しいデータ構造の配列

let expandedReply = false;
let replyToIdForMastodon = '';
let replyToIdForBluesky = '';
let replyToPost: PresentedPost = {
  display_posted_at: undefined,
  trimmed_text: '',
  postOfType: {
    mastodon: undefined,
    bluesky: undefined,
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

    // Swarm URLの検出と自動スクレイピング処理
    // 日本語テキスト内のURLも検出（〜や、で終わる場合を考慮）
    const swarmUrlPattern = /https:\/\/(ja\.)?swarmapp\.com\/user\/\d+\/checkin\/[a-zA-Z0-9]+(\?[^\s、〜～]*)?/;
    const foundSwarmUrl = text.match(swarmUrlPattern);
    let swarmHandled = false;
    
    if (foundSwarmUrl) {
      console.log('Swarm URL detected:', foundSwarmUrl[0]);
      console.log('Original text:', text);
      
      // Swarm URLをスクレイピングして投稿テキストを生成
      swarmHandled = await scrapeSwarmCheckin(foundSwarmUrl[0]);
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

      const urlObj = new URL(url);
      const pathParts = urlObj.pathname.split('/');
      return pathParts[pathParts.length - 1];
    };    
  
    // 送信する画像URLリストを作成 (croppedUrlがあれば優先、なければoriginalUrl)
    const urlsToPost = images.map(img => img.croppedUrl ?? img.originalUrl);

    const res = await postToSns(text, urlsToPost, { reply_to_ids: {
      mastodon: getPostId(replyToPost?.postOfType['mastodon']?.url ?? replyToIdForMastodon),
      bluesky: getPostId(replyToPost?.postOfType['bluesky']?.url ?? replyToIdForBluesky),
    } });

    if (res.errors.length == 0) {
      replyToIdForMastodon = '';
      replyToIdForBluesky = '';
      replyToPost = {
        display_posted_at: undefined,
        trimmed_text: '',
        postOfType: {
          mastodon: undefined,
          bluesky: undefined,
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
  postSettings.mastodon = loadPostSetting('mastodon');
  postSettings.bluesky = loadPostSetting('bluesky');

  Object.entries(postTo).forEach(([k, v]) => {
    postTo[k as SettingType] = postSettings?.[k as SettingType]?.enabled ?? false;
  });
};

const onVersion = async () => { 
  apiVer = await getApiVersion();
}

const onLoadMyPosts = async () => { 
  myPosts = [];
  loadingMyPosts = true;
  myPosts = await loadMyPosts();
  loadingMyPosts = false;
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
    <input class="mt-1 form-check-input" type="checkbox" bind:checked={postTo.mastodon} id="mastodon" disabled={postSettings.mastodon == null}>
    <div class="w-100">
      <MastodonConnection on:onChange={onChangePostSettings} />
    </div>
  </div>
  <div class="form-check mb-0 d-flex flex-row align-items-start gap-1">
    <input class="mt-1 form-check-input" type="checkbox" bind:checked={postTo.bluesky} id="bluesky" disabled={postSettings.bluesky == null}>
    <div class="w-100">
      <BlueskyConnection on:onChange={onChangePostSettings} />
    </div>
  </div>
</div>

<div class="mt-4">

  <div class="mb-3">
    <span class="h5">Message:</span>
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
      {#if postSettings.mastodon != null && postTo.mastodon}
      <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" fill="currentColor" class="bi bi-mastodon" viewBox="0 0 16 16">
        <path d="M11.19 12.195c2.016-.24 3.77-1.475 3.99-2.603.348-1.778.32-4.339.32-4.339 0-3.47-2.286-4.488-2.286-4.488C12.062.238 10.083.017 8.027 0h-.05C5.92.017 3.942.238 2.79.765c0 0-2.285 1.017-2.285 4.488l-.002.662c-.004.64-.007 1.35.011 2.091.083 3.394.626 6.74 3.78 7.57 1.454.383 2.703.463 3.709.408 1.823-.1 2.847-.647 2.847-.647l-.06-1.317s-1.303.41-2.767.36c-1.45-.05-2.98-.156-3.215-1.928a3.614 3.614 0 0 1-.033-.496s1.424.346 3.228.428c1.103.05 2.137-.064 3.188-.189zm1.613-2.47H11.13v-4.08c0-.859-.364-1.295-1.091-1.295-.804 0-1.207.517-1.207 1.541v2.233H7.168V5.89c0-1.024-.403-1.541-1.207-1.541-.727 0-1.091.436-1.091 1.296v4.079H3.197V5.522c0-.859.22-1.541.66-2.046.456-.505 1.052-.764 1.793-.764.856 0 1.504.328 1.933.983L8 4.39l.417-.695c.429-.655 1.077-.983 1.934-.983.74 0 1.336.259 1.791.764.442.505.661 1.187.661 2.046v4.203z"/>
      </svg>
      {/if}
      {#if postSettings.bluesky != null && postTo.bluesky}
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 -3.268 64 68.414" width="16" height="16"><path fill="currentColor" d="M13.873 3.805C21.21 9.332 29.103 20.537 32 26.55v15.882c0-.338-.13.044-.41.867-1.512 4.456-7.418 21.847-20.923 7.944-7.111-7.32-3.819-14.64 9.125-16.85-7.405 1.264-15.73-.825-18.014-9.015C1.12 23.022 0 8.51 0 6.55 0-3.268 8.579-.182 13.873 3.805zm36.254 0C42.79 9.332 34.897 20.537 32 26.55v15.882c0-.338.13.044.41.867 1.512 4.456 7.418 21.847 20.923 7.944 7.111-7.32 3.819-14.64-9.125-16.85 7.405 1.264 15.73-.825 18.014-9.015C62.88 23.022 64 8.51 64 6.55c0-9.818-8.578-6.732-13.873-2.745z"/></svg>
      {/if}
      <span>Post</span>
    </div>
    {/if}

  </button>

  <button class="btn btn-primary-outline" on:click="{() => {
    text = '';
    images = []; // 画像データをクリア
    replyToIdForMastodon = '';
    replyToIdForBluesky = '';
    replyToPost = {
      display_posted_at: undefined,
      trimmed_text: '',
      postOfType: {
        mastodon: undefined,
        bluesky: undefined,
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
    <span class:text-danger={tweetLength > TWITTER_WARN_LENGTH}> <!-- 文字数表示エリア -->
      {tweetLength} / {TWITTER_WARN_LENGTH} 文字
    </span>
  </div> <!-- ボタンと文字数横並び div 閉じタグ -->

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

  {#if postSettings.mastodon != null && postTo.mastodon}
  <div style="width: 100%;" class="d-flex flex-row align-items-center gap-1">
    <svg style="width: 18px;" xmlns="http://www.w3.org/2000/svg" width="14" height="14" fill="currentColor" class="bi bi-mastodon" viewBox="0 0 16 16">
      <path d="M11.19 12.195c2.016-.24 3.77-1.475 3.99-2.603.348-1.778.32-4.339.32-4.339 0-3.47-2.286-4.488-2.286-4.488C12.062.238 10.083.017 8.027 0h-.05C5.92.017 3.942.238 2.79.765c0 0-2.285 1.017-2.285 4.488l-.002.662c-.004.64-.007 1.35.011 2.091.083 3.394.626 6.74 3.78 7.57 1.454.383 2.703.463 3.709.408 1.823-.1 2.847-.647 2.847-.647l-.06-1.317s-1.303.41-2.767.36c-1.45-.05-2.98-.156-3.215-1.928a3.614 3.614 0 0 1-.033-.496s1.424.346 3.228.428c1.103.05 2.137-.064 3.188-.189zm1.613-2.47H11.13v-4.08c0-.859-.364-1.295-1.091-1.295-.804 0-1.207.517-1.207 1.541v2.233H7.168V5.89c0-1.024-.403-1.541-1.207-1.541-.727 0-1.091.436-1.091 1.296v4.079H3.197V5.522c0-.859.22-1.541.66-2.046.456-.505 1.052-.764 1.793-.764.856 0 1.504.328 1.933.983L8 4.39l.417-.695c.429-.655 1.077-.983 1.934-.983.74 0 1.336.259 1.791.764.442.505.661 1.187.661 2.046v4.203z"/>
    </svg>

    <input class="form-control" type="text" placeholder="Toot URL or ID" bind:value={replyToIdForMastodon}  />    
  </div>
  {/if}

  {#if postSettings.bluesky != null && postTo.bluesky}            
  <div style="width: 100%;" class="d-flex flex-row align-items-center gap-1">
    <svg style="width: 18px;" xmlns="http://www.w3.org/2000/svg" viewBox="0 -3.268 64 68.414" width="16" height="16"><path fill="currentColor" d="M13.873 3.805C21.21 9.332 29.103 20.537 32 26.55v15.882c0-.338-.13.044-.41.867-1.512 4.456-7.418 21.847-20.923 7.944-7.111-7.32-3.819-14.64 9.125-16.85-7.405 1.264-15.73-.825-18.014-9.015C1.12 23.022 0 8.51 0 6.55 0-3.268 8.579-.182 13.873 3.805zm36.254 0C42.79 9.332 34.897 20.537 32 26.55v15.882c0-.338.13.044.41.867 1.512 4.456 7.418 21.847 20.923 7.944 7.111-7.32 3.819-14.64-9.125-16.85 7.405 1.264 15.73-.825 18.014-9.015C62.88 23.022 64 8.51 64 6.55c0-9.818-8.578-6.732-13.873-2.745z"/></svg>
    <input class="form-control" type="text" placeholder="Post URL or ID" bind:value={replyToIdForBluesky}  />
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
  <span>api_build: {apiVer.build_at}</span>
  <span>api_ver: {apiVer.env_ver}</span>
  {/if}
</div>
