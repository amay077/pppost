<script lang="ts">
  import { Config } from "../config";

  const doAuth =() => {
    const authURL = `https://foursquare.com/oauth2/authenticate?client_id=${Config.CLIENT_ID}&response_type=code&redirect_uri=${Config.REDIRECT_URI}`;
    window.location.href = authURL;
  };

</script>

<div class="connect_container">
  <button class="connect_button" on:click={doAuth}>Connect to Foursquare</button>
</div>
