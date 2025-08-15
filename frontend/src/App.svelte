<script lang="ts">
  import MainContent from "./lib/MainContent.svelte";


</script>

<div class="app-header">
  <h1 class="app-title">PPPOST</h1>
</div>

<main class="container-md app-main">
  <MainContent />
</main>

<style>
  .app-header {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    height: 56px;
    background-color: #1e7e34;
    border-bottom: 1px solid #155724;
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 1000;
  }

  .app-title {
    font-size: 20px;
    font-weight: 600;
    margin: 0;
    color: #fff;
  }

  .app-main {
    margin-top: 72px; /* header height + some padding */
    padding-bottom: 20px;
  }
</style>
