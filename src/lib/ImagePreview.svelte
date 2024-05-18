<script lang="ts">
import { onMount } from "svelte";
import { loadImageAsDataURL } from "./image-func";
// import Croppie from "croppie";
import 'croppie/croppie.css'
import Croppie, { CroppieOptions } from 'croppie';



let imageDataURLs: string[] = [];

onMount(async () => {
  
  // const Croppie = import("croppie");
  // worker.start();
  // const opts = {};
  const c = new Croppie(document.getElementById('item'), opts);
// call a method
// c.method(args);
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

  <div
    class="d-flex flex-row align-items-center justify-content-center p-2"
  >
    <!-- 
      #fileInput 
      (change)="onChangeFileInput()"
      (click)="onClickFileInputButton()"
    -->
    <input type="file" style="display: inherit"  accept="image/*"  multiple on:change={onChange} />
    <div style="width: 70%;">
      <button class="btn btn-lg btn-block btn-primary" ><i class="fa fa-plus" aria-hidden="true"></i>&nbsp;画像を追加</button>
    </div>
    <div style="width: 30%; padding-left: 8px;">
      <!-- [disabled]="previews.length == 0" -->
      <!-- (click)="onClearImages()" -->
      <button  class="btn btn-lg btn-block btn-secondary" >クリア</button>
    </div>
  </div>

  <div>
    {#each imageDataURLs as dataURL, index }
    <div class="d-flex" style="min-width: 200px; max-width: 200px;">
      <span>{index}</span>
      <img src={dataURL} alt="dummy" style="object-fit: contain; min-width: 200px; max-width: 200px;">
    </div>
    {/each}
  </div>
</div>
