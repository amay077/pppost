<script lang="ts">
  import { createEventDispatcher } from "svelte";
  import { Config } from "../config";
  import { deletePostSetting, loadPostSetting } from "./func";

  const dispatch = createEventDispatcher<{ onChange: void }>();

  let expandedThreads = false;

  const threadsTarget = Config.post_targets.threads;

  let postSettings = loadPostSetting('threads');

  const onConnectToThreads = () => {
    const params = new URLSearchParams({
      client_id: threadsTarget.client_id,
      redirect_uri: threadsTarget.redirect_uri,
      response_type: 'code',
      scope: 'threads_basic,threads_content_publish',
      state: 'threads_callback',
    });
    const url = `https://threads.net/oauth/authorize?${params.toString()}`;

    // 同一タブで authorize ページへ遷移する（別タブだとコールバックを掴めない）
    window.location.href = url;
  };
</script>

<div>

  <!-- svelte-ignore a11y-click-events-have-key-events -->
  <!-- svelte-ignore a11y-no-static-element-interactions -->
  <div class="d-flex flex-row gap-1 align-items-center" style="cursor: pointer;"  on:click={() => {
    expandedThreads = !expandedThreads;
  }}>
    <h5 class="mb-0">Threads</h5>
    {#if !expandedThreads}
    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" fill="currentColor" class="bi bi-chevron-right" viewBox="0 0 16 16">
      <path fill-rule="evenodd" d="M4.646 1.646a.5.5 0 0 1 .708 0l6 6a.5.5 0 0 1 0 .708l-6 6a.5.5 0 0 1-.708-.708L10.293 8 4.646 2.354a.5.5 0 0 1 0-.708z"/>
    </svg>
    {:else}
    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" fill="currentColor" class="bi bi-chevron-down" viewBox="0 0 16 16">
      <path fill-rule="evenodd" d="M1.646 4.646a.5.5 0 0 1 .708 0L8 10.293l5.646-5.647a.5.5 0 0 1 .708.708l-6 6a.5.5 0 0 1-.708 0l-6-6a.5.5 0 0 1 0-.708z"/>
    </svg>
    {/if}
  </div>
  {#if expandedThreads}
  <div class="p-1">

    {#if postSettings != null}
    <div class="d-flex flex-row gap-2 align-items-center">
      <span>接続済み</span>
      <button class="btn btn-sm btn-outline-primary" style="width: 60px;" on:click={() => {
        postSettings = null;
        deletePostSetting('threads');
        dispatch('onChange');
      }}>切断</button>
    </div>
    {:else}
    <div class="d-flex flex-column gap-1">
      <span>Threads アカウントに接続</span>
      <div class="d-flex flex-row gap-1">
        <button class="btn btn-sm btn-primary" style="width: 60px;" on:click={onConnectToThreads}>接続</button>
      </div>
    </div>
    {/if}


  </div>
  {/if}
</div>
