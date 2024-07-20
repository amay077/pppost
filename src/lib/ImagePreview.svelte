<script lang="ts">
import { onMount } from "svelte";
import { loadImageAsDataURL } from "./image-func";
// import Croppie from "croppie";
import 'croppie/croppie.css'
// import Croppie, { CroppieOptions } from 'croppie';



export let imageDataURLs: string[] = [];

let fileInput: any;

onMount(async () => {
  
  // const Croppie = import("croppie");
  // worker.start();
  // const opts = {};
  // const c = new Croppie(document.getElementById('item'), opts);
// call a method
// c.method(args);

	// ペーストイベントの処理を付ける
	document.addEventListener("paste", async (event: any) => {
    for (const items of event?.clipboardData?.items ?? []) {
      if (!items?.type?.startsWith(`image/`)) {
        continue;
      }

      const file = items.getAsFile();
      const url = await loadImageAsDataURL(file)
      imageDataURLs = [...imageDataURLs, url];
    }
	});

});

const onChange = async (evt: any) => {
  
  const files = evt?.target?.files ?? [];

  const images = imageDataURLs ?? [];
  for (const file of files) {

    const a = await loadImageAsDataURL(file);
    images.push(a);
  }

  imageDataURLs = images;


  console.log(evt, files);
}

</script>

<div class="d-flex flex-column">

  <div class="d-flex flex-row align-items-center justify-content-between">
    <input bind:this={fileInput} type="file" style="display: none" accept="image/*"  multiple on:change={onChange} />
    <button class="btn btn-sm btn-block btn-primary" 
    on:click={() => {
      fileInput.click()
    }}
    >
      <i class="fa fa-plus" aria-hidden="true"></i>&nbsp;画像を追加
    </button>
    <button class="btn btn-sm btn-block btn-secondary"
      on:click={() => {
        imageDataURLs = [];
      }}
    >クリア</button>
  </div>

  <div class="mt-2 d-flex flex-row gap-2 flex-wrap">
    {#each imageDataURLs as dataURL, index }
    <div class="d-flex flex-row align-items-center" style="min-width: 200px; max-width: 200px; border: 1px solid #DFDFDF; border-radius: 3px;">
      <img src={dataURL} alt="dummy" style="padding: 2px; object-fit: contain; min-width: 200px; max-width: 200px;">
    </div>
    {/each}
  </div>
</div>
