<script lang="ts">
  import { createEventDispatcher } from "svelte";
  import { Config } from "../config";
  import { deletePostSetting, loadPostSetting, loadSessionId, savePostSetting, saveSessionId } from "./func";

  const dispatch = createEventDispatcher<{ onChange: void }>();

  let expandedMisskey = false;

  let misskeyHost = 'misskey.io';
  // MiAuth のセッション識別子。接続操作ごとに新規生成し、再利用しない。
  let miauthSession = '';

  let postSettings = loadPostSetting('misskey');
  let isBusy = false;

  const onConnectToMisskey = () => {
    if ((misskeyHost?.length ?? 0) <= 0) {
      alert('Misskey のホスト名を入力してください。');
      return;
    }

    miauthSession = crypto.randomUUID();

    const params = new URLSearchParams({
      name: 'PPPOST',
      permission: 'write:notes,write:drive,read:account,read:drive',
    });
    const url = `https://${misskeyHost}/miauth/${miauthSession}?${params.toString()}`;

    // url を別タブで開く
    window.open(url, '_blank');
  };

  const onApplyMisskeyAccessToken = async () => {
    if (miauthSession.length <= 0) {
      alert('先に「接続」を実行してください。');
      return;
    }

    isBusy = true;
    try {
      // 既存セッションがあれば再利用する（トークンはサーバー保管、返るのは session_id とメタのみ）
      const existingSessionId = loadSessionId();
      const headers: Record<string, string> = {};
      if (existingSessionId != null) {
        headers['Authorization'] = `Bearer ${existingSessionId}`;
      }

      const res = await fetch(`${Config.API_ENDPOINT}/misskey_token?host=${encodeURIComponent(misskeyHost)}&session=${encodeURIComponent(miauthSession)}`, { headers });

      if (!res.ok) {
        console.error(`failed to fetch:`, res);
        alert('Misskey への接続に失敗しました。Misskey の認証ページで許可を済ませてから、もう一度お試しください。');
        return;
      }

      const resJson = await res.json();
      saveSessionId(resJson.session_id);
      postSettings = { type: 'misskey', title: 'Misskey', enabled: true, host: resJson.host, username: resJson.username };
      savePostSetting(postSettings);
      miauthSession = '';
      dispatch('onChange');

      alert('Misskey に接続しました。');
    } catch (error) {
      console.error(`onApplyMisskeyAccessToken -> error:`, error);
      alert('Misskey への接続に失敗しました。Misskey の認証ページで許可を済ませてから、もう一度お試しください。');
    } finally {
      isBusy = false;
    }
  };

  const onDisconnect = async () => {
    isBusy = true;
    try {
      const sessionId = loadSessionId();
      if (sessionId != null) {
        try {
          await fetch(`${Config.API_ENDPOINT}/sns_disconnect`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${sessionId}` },
            body: JSON.stringify({ sns_type: 'misskey' }),
          });
        } catch (error) {
          console.error(`onDisconnect -> error:`, error);
        }
      }
      postSettings = null;
      deletePostSetting('misskey');
      dispatch('onChange');
    } finally {
      isBusy = false;
    }
  };
</script>

<div>

  <!-- svelte-ignore a11y-click-events-have-key-events -->
  <!-- svelte-ignore a11y-no-static-element-interactions -->
  <div class="d-flex flex-row gap-1 align-items-center" style="cursor: pointer;"  on:click={() => {
    expandedMisskey = !expandedMisskey;
  }}>
    <h5 class="mb-0">Misskey</h5>
    {#if !expandedMisskey}
    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" fill="currentColor" class="bi bi-chevron-right" viewBox="0 0 16 16">
      <path fill-rule="evenodd" d="M4.646 1.646a.5.5 0 0 1 .708 0l6 6a.5.5 0 0 1 0 .708l-6 6a.5.5 0 0 1-.708-.708L10.293 8 4.646 2.354a.5.5 0 0 1 0-.708z"/>
    </svg>
    {:else}
    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" fill="currentColor" class="bi bi-chevron-down" viewBox="0 0 16 16">
      <path fill-rule="evenodd" d="M1.646 4.646a.5.5 0 0 1 .708 0L8 10.293l5.646-5.647a.5.5 0 0 1 .708.708l-6 6a.5.5 0 0 1-.708 0l-6-6a.5.5 0 0 1 0-.708z"/>
    </svg>
    {/if}
  </div>
  {#if expandedMisskey}
  <div class="p-1">

    {#if postSettings != null}
    <div class="d-flex flex-row gap-2 align-items-center">
      <span>接続済み ({postSettings.username}@{postSettings.host})</span>
      <button class="btn btn-sm btn-outline-primary" style="width: 60px;" on:click={onDisconnect} disabled={isBusy}>
        {#if isBusy}
        <div class="spinner-border spinner-border-sm" role="status">
          <span class="visually-hidden">Loading...</span>
        </div>
        {:else}
        切断
        {/if}
      </button>
    </div>
    {:else}
    <div class="d-flex flex-column gap-1">
      <div class="d-flex flex-column gap-1">
        <span>1.Misskey サーバーに接続</span>
        <div class="d-flex flex-row gap-1">
          <input class="form-control form-control-sm" type="text" placeholder="misskey.io" bind:value={misskeyHost}>
          <button class="btn btn-sm btn-primary" disabled={misskeyHost?.length <= 0} style="width: 60px;" on:click={onConnectToMisskey}>接続</button>
        </div>
      </div>
      <div class="d-flex flex-column gap-1">
        <span>2.別タブで許可した後、接続を完了</span>
        <div class="d-flex flex-row gap-1">
          <button class="btn btn-sm btn-primary" disabled={isBusy || miauthSession.length <= 0} on:click={onApplyMisskeyAccessToken}>
            {#if isBusy}
            <div class="spinner-border spinner-border-sm" role="status">
              <span class="visually-hidden">Loading...</span>
            </div>
            {:else}
            接続を完了
            {/if}
          </button>
        </div>
      </div>
    </div>
    {/if}


  </div>
  {/if}
</div>
