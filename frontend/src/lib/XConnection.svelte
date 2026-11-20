<script lang="ts">
  import { createEventDispatcher } from "svelte";
  import { deletePostSetting, fetchWithTimeout, loadPostSetting, savePostSetting, type SettingDataX } from "./func";

  const dispatch = createEventDispatcher<{ onChange: void }>();

  type XHealth = {
    ok: boolean,
    account: string,
    chrome_tab: boolean,
    logged_in: boolean,
    composer_ready: boolean,
    draft_exists?: boolean,
    busy: boolean,
    last_post_at: string | null,
    error?: string,
    message?: string,
  };

  let expandedX = false;
  let postSettings: SettingDataX | null = loadPostSetting('x');
  let apiBaseUrl = postSettings?.api_base_url ?? '';
  let apiToken = postSettings?.api_token ?? '';
  let isBusy = false;
  let health: XHealth | null = null;
  let errorMessage = '';

  const normalizeBaseUrl = (value: string): string => value.trim().replace(/\/+$/, '');

  const describeHealth = (body: XHealth): string => {
    if (body.error === 'NO_CHROME_TAB') return 'Chrome または X のタブがありません。';
    if (body.error === 'NO_ACCOUNT') return '対象アカウントの X タブがありません。';
    if (body.error === 'CHROME_PERMISSION') return body.message ?? 'Chrome の権限が不足しています。';
    if (body.error && body.message && body.message.length > 0) return body.message;
    if (!body.chrome_tab) return 'Chrome が起動していないか、X のタブがありません。';
    if (!body.logged_in) return '対象アカウントでログインしていません。';
    if (!body.composer_ready) return 'X の投稿欄が見つかりません。x.com/home を開いてください。';
    return '';
  };

  const onTestConnection = async () => {
    const wasConnected = postSettings != null;
    const baseUrl = normalizeBaseUrl(apiBaseUrl);
    const token = apiToken.trim();
    if (baseUrl.length == 0 || token.length == 0) {
      alert('API URL と API トークンを入力してください。');
      return;
    }

    const isLocal = /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(baseUrl);
    if (!baseUrl.startsWith('https://') && !isLocal) {
      errorMessage = 'API URL は https:// で指定してください（localhost を除く）。';
      return;
    }

    isBusy = true;
    health = null;
    errorMessage = '';
    try {
      const res = await fetchWithTimeout(`${baseUrl}/health`, {
        method: 'GET',
        headers: { 'Authorization': `Bearer ${token}` },
      }, 15000);

      if (res.status === 401) {
        errorMessage = 'API トークンが正しくありません。';
        return;
      }

      let body: XHealth | null = null;
      try {
        body = await res.json();
      } catch {
        body = null;
      }

      if (!res.ok || body == null) {
        errorMessage = body?.message ?? `x-post-api が HTTP ${res.status} を返しました。`;
        return;
      }

      health = body;
      const reason = describeHealth(body);
      if (reason.length > 0) {
        errorMessage = reason;
      }

      // トークンが通れば、Chrome の状態にかかわらず設定を保存する
      postSettings = {
        type: 'x',
        title: 'X',
        enabled: true,
        api_base_url: baseUrl,
        api_token: token,
        account: body.account?.length > 0 ? body.account : 'unknown',
      };
      savePostSetting(postSettings);
      apiBaseUrl = baseUrl;
      apiToken = token;
      dispatch('onChange');

      if (reason.length == 0 && !wasConnected) {
        alert('X に接続しました。');
      }
    } catch (error) {
      console.error(`onTestConnection -> error:`, error);
      errorMessage = 'x-post-api に接続できません。Tailscale とホスト Mac の状態を確認してください。';
    } finally {
      isBusy = false;
    }
  };

  const onDisconnect = () => {
    postSettings = null;
    health = null;
    errorMessage = '';
    apiToken = '';
    deletePostSetting('x');
    dispatch('onChange');
  };
</script>

<div>

  <!-- svelte-ignore a11y-click-events-have-key-events -->
  <!-- svelte-ignore a11y-no-static-element-interactions -->
  <div class="d-flex flex-row gap-1 align-items-center" style="cursor: pointer;" on:click={() => {
    expandedX = !expandedX;
  }}>
    <h5 class="mb-0">X</h5>
    {#if !expandedX}
    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" fill="currentColor" class="bi bi-chevron-right" viewBox="0 0 16 16">
      <path fill-rule="evenodd" d="M4.646 1.646a.5.5 0 0 1 .708 0l6 6a.5.5 0 0 1 0 .708l-6 6a.5.5 0 0 1-.708-.708L10.293 8 4.646 2.354a.5.5 0 0 1 0-.708z"/>
    </svg>
    {:else}
    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" fill="currentColor" class="bi bi-chevron-down" viewBox="0 0 16 16">
      <path fill-rule="evenodd" d="M1.646 4.646a.5.5 0 0 1 .708 0L8 10.293l5.646-5.647a.5.5 0 0 1 .708.708l-6 6a.5.5 0 0 1-.708 0l-6-6a.5.5 0 0 1 0-.708z"/>
    </svg>
    {/if}
  </div>
  {#if expandedX}
  <div class="p-1">

    {#if postSettings != null}
    <div class="d-flex flex-column gap-1">
      <div class="d-flex flex-row gap-2 align-items-center">
        <span>接続済み (@{postSettings.account})</span>
        <button class="btn btn-sm btn-outline-primary" on:click={onTestConnection} disabled={isBusy}>
          {#if isBusy}
          <div class="spinner-border spinner-border-sm" role="status">
            <span class="visually-hidden">Loading...</span>
          </div>
          {:else}
          再テスト
          {/if}
        </button>
        <button class="btn btn-sm btn-outline-primary" style="width: 60px;" on:click={onDisconnect} disabled={isBusy}>
          切断
        </button>
      </div>
      {#if health != null}
      <div class="text-muted" style="font-size: 90%;">
        Chrome: {health.chrome_tab ? 'OK' : 'NG'} / ログイン: {health.logged_in ? 'OK' : 'NG'} / 投稿欄: {health.composer_ready ? 'OK' : 'NG'}
      </div>
      {/if}
      {#if errorMessage.length > 0}
      <div class="text-danger" style="font-size: 90%;">{errorMessage}</div>
      {/if}
    </div>
    {:else}
    <div class="d-flex flex-column gap-1">
      <span>1.x-post-api の URL を入力</span>
      <input class="form-control form-control-sm" type="text" placeholder="https://x-post-api.<tailnet>.ts.net" bind:value={apiBaseUrl}>
      <span>2.API トークンを入力</span>
      <input class="form-control form-control-sm" type="password" placeholder="X_API_TOKEN" bind:value={apiToken}>
      <button class="btn btn-sm btn-primary" disabled={isBusy || apiBaseUrl.trim().length == 0 || apiToken.trim().length == 0} on:click={onTestConnection}>
        {#if isBusy}
        <div class="spinner-border spinner-border-sm" role="status">
          <span class="visually-hidden">Loading...</span>
        </div>
        {:else}
        接続テスト
        {/if}
      </button>
      {#if errorMessage.length > 0}
      <div class="text-danger" style="font-size: 90%;">{errorMessage}</div>
      {/if}
    </div>
    {/if}

  </div>
  {/if}
</div>
