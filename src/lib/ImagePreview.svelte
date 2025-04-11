<script lang="ts">
import { onMount } from "svelte";
import { loadImageAsDataURL } from "./image-func";
import ImageCropperModal from "./ImageCropperModal.svelte"; // 新しいモーダルをインポート


export let imageDataURLs: string[] = [];

let fileInput: HTMLInputElement; // 型を明確に
let showCropModal = false; // モーダルの表示状態
let imageToCrop: string | null = null; // クロップ対象の画像 URL

onMount(() => { // async は不要に
	// ペーストイベントの処理を付ける
	document.addEventListener("paste", async (event: any) => {
    for (const items of event?.clipboardData?.items ?? []) {
      if (!items?.type?.startsWith(`image/`)) {
        continue;
      }

      const file = items.getAsFile();
      const url = await loadImageAsDataURL(file);
      imageDataURLs = [...imageDataURLs, url]; // 直接追加する
      // imageToCrop = url; // モーダル表示ロジックは削除
      // showCropModal = true;
    }
	});

});

const onChange = async (evt: any) => {
  
  const files = evt?.target?.files ?? [];

  // const images = imageDataURLs ?? []; // 一時配列は不要に
  if (files.length > 0) {
    // 複数ファイルに対応
    const images = [...imageDataURLs]; // 現在の配列をコピー
    for (const file of files) {
        const url = await loadImageAsDataURL(file);
        images.push(url); // 直接追加する
    }
    imageDataURLs = images; // 更新
    // imageToCrop = url; // モーダル表示ロジックは削除
    // showCropModal = true;
  }

  // imageDataURLs = images; // モーダル完了時に追加

  // console.log(evt, files); // デバッグ用
}

let imageIndexToCrop: number | null = null; // クロップ対象のインデックス

// 編集ボタンクリック時の処理
const openCropModal = (index: number) => {
  imageIndexToCrop = index;
  imageToCrop = imageDataURLs[index];
  showCropModal = true;
};

// クロップ完了時の処理
const handleCropComplete = (event: CustomEvent<string>) => {
  if (imageIndexToCrop === null) return; // 対象インデックスがない場合は何もしない

  const croppedImageUrl = event.detail;
  const updatedImages = [...imageDataURLs]; // 配列をコピー
  updatedImages[imageIndexToCrop] = croppedImageUrl; // 特定のインデックスを置き換え
  imageDataURLs = updatedImages; // 配列を更新

  showCropModal = false; // モーダルを閉じる
  imageToCrop = null; // クロップ対象画像をクリア
  imageIndexToCrop = null; // 対象インデックスをクリア
  // fileInput.value = ''; // ファイル選択は完了しているのでリセット不要
};

// クロップキャンセル時の処理
const handleCropCancel = () => {
  showCropModal = false; // モーダルを閉じる
  imageToCrop = null; // クロップ対象画像をクリア
  imageIndexToCrop = null; // 対象インデックスをクリア
};

</script>

<div class="d-flex flex-column">

  <div class="d-flex flex-row align-items-center justify-content-between mb-2"> <!-- mb-2 を追加 -->
    <!-- multiple を再度有効化 -->
    <input bind:this={fileInput} type="file" style="display: none" accept="image/*" multiple on:change={onChange} />
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
      disabled={imageDataURLs.length === 0}
    >クリア</button>
  </div>

  <div class="d-flex flex-row gap-2 flex-wrap">
    {#each imageDataURLs as dataURL, index (dataURL)}
    <div class="position-relative d-flex align-items-center justify-content-center" style="min-height: 100px; border: 1px solid #DFDFDF; border-radius: 3px;"> <!-- width: 100px を削除, min-height は維持 -->
      <img src={dataURL} alt={`preview ${index + 1}`} style="height: 100px; width: auto; object-fit: contain; display: block;"> <!-- height: 100px, width: auto に変更 -->
      <!-- 削除ボタン -->
      <button
        class="btn btn-danger btn-sm position-absolute top-0 end-0 p-0 m-1 d-flex justify-content-center align-items-center"
        style="line-height: 1; width: 1.2rem; height: 1.2rem; border-radius: 50%; font-size: 0.8rem;"
        aria-label={`画像を削除 ${index + 1}`}
        on:click={() => {
          imageDataURLs = imageDataURLs.filter((_, i) => i !== index);
        }}
      >
        &times;
      </button>
      <!-- 編集ボタン -->
      <button
        class="btn btn-secondary btn-sm position-absolute bottom-0 end-0 p-0 m-1 d-flex justify-content-center align-items-center"
        style="line-height: 1; width: 1.2rem; height: 1.2rem; border-radius: 50%; font-size: 0.7rem;"
        aria-label={`画像を編集 ${index + 1}`}
        on:click={() => openCropModal(index)}
      >
        <!-- SVG for three dots -->
        <svg xmlns="http://www.w3.org/2000/svg" width="1em" height="1em" fill="currentColor" class="bi bi-pencil-fill" viewBox="0 0 16 16">
          <path d="M12.854.146a.5.5 0 0 0-.707 0L10.5 1.793 14.207 5.5l1.647-1.646a.5.5 0 0 0 0-.708l-3-3zm.646 6.061L9.793 2.5 3.293 9H3.5a.5.5 0 0 1 .5.5v.5h.5a.5.5 0 0 1 .5.5v.5h.5a.5.5 0 0 1 .5.5v.5h.5a.5.5 0 0 1 .5.5v.207l6.5-6.5zm-7.468 7.468A.5.5 0 0 1 6 13.5V13h-.5a.5.5 0 0 1-.5-.5V12h-.5a.5.5 0 0 1-.5-.5V11h-.5a.5.5 0 0 1-.5-.5V10h-.5a.499.499 0 0 1-.175-.032l-.179.178a.5.5 0 0 0-.11.168l-2 5a.5.5 0 0 0 .65.65l5-2a.5.5 0 0 0 .168-.11l.178-.178z"/>
        </svg>
      </button>
    </div>
    {/each}
  </div>

  <!-- クロップモーダル -->
  {#if showCropModal && imageToCrop}
    <ImageCropperModal
      imageUrl={imageToCrop}
      bind:showModal={showCropModal}
      on:cropComplete={handleCropComplete}
      on:cropCancel={handleCropCancel}
    />
  {/if}

</div>
