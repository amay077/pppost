<script lang="ts">
import { onMount } from "svelte";

// @ts-ignore-next-line
import twitterText from "twitter-text";

import MastodonConnection from "./MastodonConnection.svelte";
import BlueskyConnection from "./BlueskyConnection.svelte";
import { loadMessage, loadPostSetting, saveMessage, type SettingType } from "./func";
import TwitterConnection from "./TwitterConnection.svelte";
import { getApiVersion, loadMyPosts, postSettings, postTo, postToSns, type Post, type PresentedPost, type ImageData } from "./MainContent"; // .ts 拡張子を削除
import ImagePreview from "./ImagePreview.svelte";
import dayjs from "dayjs";

const built_at = (window as any)['built_at'] ?? '';
let apiVer: { build_at: string, env_ver: string } = { build_at: '', env_ver: '' };
let myPosts: PresentedPost[] =[];

let loading = true;
let loadingMyPosts = false;
let posting = false;

let text = loadMessage()?.message ?? '';
// let imageDataURLs: string[] = []; // 古い形式は削除
let images: ImageData[] = []; // 新しいデータ構造の配列

let expandedReply = false;
let replyToIdForMastodon = '';
let replyToIdForBluesky = '';
let replyToIdForTwitter = '';
let replyToPost: PresentedPost = { 
  display_posted_at: undefined, 
  trimmed_text: '', 
  postOfType: {
    mastodon: undefined,
    bluesky: undefined,
    twitter: undefined,
  }
};

// Twitter 文字数カウント
$: tweetLength = twitterText.parseTweet(text).weightedLength / 2; // エクスポートされた名前空間を使用
const TWITTER_WARN_LENGTH = 140; // 現在のTwitterの文字数上限（警告を出す文字数）

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

    if ((content?.length ?? 0) > 0) {
      text = content ?? '';
    } else if ((url?.length ?? 0) > 0) {
      text = url ?? '';
    }

  } finally {
    loading = false;
  }
});    

const onTextChange = () => {
  saveMessage({ message: text });
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
      twitter: getPostId(replyToPost?.postOfType['twitter']?.url ?? replyToIdForTwitter),
      bluesky: getPostId(replyToPost?.postOfType['bluesky']?.url ?? replyToIdForBluesky),
    } });

    if (res.errors.length == 0) {
      text = '';
      onTextChange();
      images = []; // 画像配列をクリア
      replyToIdForMastodon = '';
      replyToIdForBluesky = '';
      replyToIdForTwitter = '';
      replyToPost = { 
        display_posted_at: undefined, 
        trimmed_text: '', 
        postOfType: {
          mastodon: undefined,
          bluesky: undefined,
          twitter: undefined,
        }
      };
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
  postSettings.twitter = loadPostSetting('twitter');

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
  <div class="form-check mb-0 d-flex flex-row align-items-start gap-1">
    <input class="mt-1 form-check-input" type="checkbox" bind:checked={postTo.twitter} id="twitter" disabled={postSettings.twitter == null}>
    <div class="w-100">
      <TwitterConnection on:onChange={onChangePostSettings} />
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
    <button class="btn btn-primary" on:click="{() => post()}" disabled={posting || text.length <= 0 || Array.from(Object.values(postTo)).every(x => !x)}>

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
      {#if postSettings.twitter != null && postTo.twitter}            
      <svg style="margin-top: -2px;" xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" class="bi bi-twitter" viewBox="0 0 16 16">
        <path d="M5.026 15c6.038 0 9.341-5.003 9.341-9.334 0-.14 0-.282-.006-.422A6.685 6.685 0 0 0 16 3.542a6.658 6.658 0 0 1-1.889.518 3.301 3.301 0 0 0 1.447-1.817 6.533 6.533 0 0 1-2.087.793A3.286 3.286 0 0 0 7.875 6.03a9.325 9.325 0 0 1-6.767-3.429 3.289 3.289 0 0 0 1.018 4.382A3.323 3.323 0 0 1 .64 6.575v.045a3.288 3.288 0 0 0 2.632 3.218 3.203 3.203 0 0 1-.865.115 3.23 3.23 0 0 1-.614-.057 3.283 3.283 0 0 0 3.067 2.277A6.588 6.588 0 0 1 .78 13.58a6.32 6.32 0 0 1-.78-.045A9.344 9.344 0 0 0 5.026 15z"/>
      </svg>
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
    replyToIdForTwitter = '';
    replyToPost = {
      display_posted_at: undefined,
      trimmed_text: '',
      postOfType: {
        mastodon: undefined,
        bluesky: undefined,
        twitter: undefined,
      }
    };
    onTextChange();
  }}" disabled={text.length <= 0 && images.length <= 0}>
    Clear
    </button>

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

  {#if postSettings.twitter != null && postTo.twitter}            
  <div style="width: 100%;" class="d-flex flex-row align-items-center gap-1">
    <svg style="width: 18px; margin-top: -2px;" xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" class="bi bi-twitter" viewBox="0 0 16 16">
      <path d="M5.026 15c6.038 0 9.341-5.003 9.341-9.334 0-.14 0-.282-.006-.422A6.685 6.685 0 0 0 16 3.542a6.658 6.658 0 0 1-1.889.518 3.301 3.301 0 0 0 1.447-1.817 6.533 6.533 0 0 1-2.087.793A3.286 3.286 0 0 0 7.875 6.03a9.325 9.325 0 0 1-6.767-3.429 3.289 3.289 0 0 0 1.018 4.382A3.323 3.323 0 0 1 .64 6.575v.045a3.288 3.288 0 0 0 2.632 3.218 3.203 3.203 0 0 1-.865.115 3.23 3.23 0 0 1-.614-.057 3.283 3.283 0 0 0 3.067 2.277A6.588 6.588 0 0 1 .78 13.58a6.32 6.32 0 0 1-.78-.045A9.344 9.344 0 0 0 5.026 15z"/>
    </svg>
    <input class="form-control" type="text" placeholder="Tweet URL or ID" bind:value={replyToIdForTwitter}  />    
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
