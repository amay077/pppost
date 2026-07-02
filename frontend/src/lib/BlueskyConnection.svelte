<script lang="ts">
  import { deletePostSetting, loadPostSetting, loadSessionId, savePostSetting, saveSessionId } from "./func";
  import { createEventDispatcher } from "svelte";
  import { Config } from "../config";

  const dispatch = createEventDispatcher<{ onChange: void }>();

  let expandedBluesky = false;

  let postSettings = loadPostSetting('bluesky');
  let user = postSettings?.handle ?? '';
  let password = '';

  const onApplyBSkySettings = async () => {
    console.log(`onApplyBSkySettings -> user:`, user);

    try {
      // 既存セッションがあれば再利用する（session データはサーバー保管、返るのは session_id とメタのみ）
      const existingSessionId = loadSessionId();
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (existingSessionId != null) {
        headers['Authorization'] = `Bearer ${existingSessionId}`;
      }

      const res = await fetch(`${Config.API_ENDPOINT}/bluesky_login`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          identifier: user,
          password
        }),
      });

      if (!res.ok) {
        const error = await res.json();
        console.error(`onApplyBSkySettings -> error:`, error);
        alert('Bluesky に接続できませんでした。');
        return;
      }

      const data = await res.json();
      saveSessionId(data.session_id);
      postSettings = { type: 'bluesky', title: 'Bluesky', enabled: true, handle: data.handle, did: data.did };
      savePostSetting(postSettings);
      dispatch('onChange');
      alert('Bluesky に接続しました。');
    } catch (error) {
      console.error(`onApplyBSkySettings -> error:`, error);
      alert('Bluesky に接続できませんでした。');
    }
  };

  const onDisconnect = async () => {
    const sessionId = loadSessionId();
    if (sessionId != null) {
      try {
        await fetch(`${Config.API_ENDPOINT}/sns_disconnect`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${sessionId}` },
          body: JSON.stringify({ sns_type: 'bluesky' }),
        });
      } catch (error) {
        console.error(`onDisconnect -> error:`, error);
      }
    }
    postSettings = null;
    deletePostSetting('bluesky');
    dispatch('onChange');
  };
</script>

  <!-- svelte-ignore a11y-click-events-have-key-events -->
  <!-- svelte-ignore a11y-no-static-element-interactions -->
  <div class="d-flex flex-row gap-1 align-items-center" style="cursor: pointer; width: 100%;"  on:click={() => {
    expandedBluesky = !expandedBluesky;
  }}>
    <h5 class="mb-0">Bluesky</h5>
    {#if !expandedBluesky}
    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" fill="currentColor" class="bi bi-chevron-right" viewBox="0 0 16 16">
      <path fill-rule="evenodd" d="M4.646 1.646a.5.5 0 0 1 .708 0l6 6a.5.5 0 0 1 0 .708l-6 6a.5.5 0 0 1-.708-.708L10.293 8 4.646 2.354a.5.5 0 0 1 0-.708z"/>
    </svg>
    {:else}
    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" fill="currentColor" class="bi bi-chevron-down" viewBox="0 0 16 16">
      <path fill-rule="evenodd" d="M1.646 4.646a.5.5 0 0 1 .708 0L8 10.293l5.646-5.647a.5.5 0 0 1 .708.708l-6 6a.5.5 0 0 1-.708 0l-6-6a.5.5 0 0 1 0-.708z"/>
    </svg>
    {/if}
  </div>
  {#if expandedBluesky}
  <div class="p-2">
    {#if postSettings != null}
    <div class="d-flex flex-row gap-2 align-items-center">
      <span>接続済み</span>
      <button class="btn btn-sm btn-outline-primary" style="width: 60px;" on:click={onDisconnect}>切断</button>
    </div>
    {:else}
    <div class="d-flex flex-column gap-1">
      <div class="d-flex flex-column gap-1">
        <span>1.ユーザーIDとアプリパスワードを入力</span>
        <div class="d-flex flex-row gap-1">
          <input class="form-control form-control-sm" placeholder="Identifier(e.g. e-mail)" type="text" bind:value={user}>
        </div>
        <div class="d-flex flex-row gap-1">
          <input class="form-control form-control-sm" type="password" placeholder="App Password" bind:value={password}>
          <button class="btn btn-sm btn-primary" disabled={user?.length <= 0 || password?.length <= 0} style="width: 60px;" on:click={onApplyBSkySettings}>接続</button>
        </div>
      </div>
    </div>
    {/if}    
  </div>
  {/if}

