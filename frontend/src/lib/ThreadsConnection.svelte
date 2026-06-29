<script lang="ts">
  import { createEventDispatcher } from "svelte";
  import { Config } from "../config";
  import { deletePostSetting, loadPostSetting, loadPrGhostSetting, savePrGhostSetting, type PrGhostSetting } from "./func";

  const dispatch = createEventDispatcher<{ onChange: void }>();

  let expandedThreads = false;

  const threadsTarget = Config.post_targets.threads;

  let postSettings = loadPostSetting('threads');

  // PR ゴースト投稿設定（500 文字制限）
  const PR_TEXT_MAX = 500;

  let prGhost: PrGhostSetting = loadPrGhostSetting() ?? {
    enabled: false,
    intervalHours: 48,
    texts: [''],
  };

  const persistPrGhost = () => {
    savePrGhostSetting(prGhost);
  };

  const addPrText = () => {
    prGhost.texts = [...prGhost.texts, ''];
    persistPrGhost();
  };

  const removePrText = (index: number) => {
    prGhost.texts = prGhost.texts.filter((_, i) => i !== index);
    if (prGhost.texts.length === 0) {
      prGhost.texts = [''];
    }
    persistPrGhost();
  };

  const onConnectToThreads = () => {
    const params = new URLSearchParams({
      client_id: threadsTarget.client_id,
      redirect_uri: threadsTarget.redirect_uri,
      response_type: 'code',
      scope: 'threads_basic,threads_content_publish,threads_manage_replies',
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

    <!-- PR ゴースト投稿設定（Threads 接続時のみ表示） -->
    <div class="d-flex flex-column gap-2 mt-3 p-2 border rounded">
      <div class="d-flex flex-row gap-2 align-items-center">
        <input type="checkbox" id="pr-ghost-enabled" bind:checked={prGhost.enabled} on:change={persistPrGhost} />
        <label for="pr-ghost-enabled" class="mb-0 fw-bold">PR ゴースト投稿（準定期）</label>
      </div>
      <small class="text-muted">
        本投稿が成功したとき、一定間隔で PR 文をゴースト投稿（24 時間で消えるテキストのみの投稿）として自動追加します。
      </small>

      {#if prGhost.enabled}
      <div class="d-flex flex-row gap-2 align-items-center">
        <label for="pr-ghost-interval" class="mb-0">付与間隔</label>
        <input type="number" id="pr-ghost-interval" class="form-control form-control-sm" style="width: 90px;"
          min="0" bind:value={prGhost.intervalHours} on:change={persistPrGhost} />
        <span>時間</span>
      </div>

      <div class="d-flex flex-column gap-2">
        <span>PR 文（登録順にローテーション）</span>
        {#each prGhost.texts as prText, index (index)}
        <div class="d-flex flex-column gap-1">
          <div class="d-flex flex-row gap-1 align-items-start">
            <textarea class="form-control form-control-sm" rows="2"
              bind:value={prGhost.texts[index]} on:input={persistPrGhost}></textarea>
            <button class="btn btn-sm btn-outline-danger" on:click={() => removePrText(index)}>削除</button>
          </div>
          {#if prText.length > PR_TEXT_MAX}
          <small class="text-danger">{prText.length} / {PR_TEXT_MAX} 文字（上限を超過しています）</small>
          {:else}
          <small class="text-muted">{prText.length} / {PR_TEXT_MAX} 文字</small>
          {/if}
        </div>
        {/each}
        <div>
          <button class="btn btn-sm btn-outline-primary" on:click={addPrText}>PR 文を追加</button>
        </div>
      </div>
      {/if}
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
