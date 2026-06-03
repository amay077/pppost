<script lang="ts">
  import { onMount } from "svelte";
  import { loadImageAsDataURL } from "./image-func";
  import ImageCropperModal from "./ImageCropperModal.svelte";
  import type Croppie from 'croppie';
  import { type ImageData } from './MainContent'; // ImageData 型をインポート

  // export let imageDataURLs: string[] = [];
  export let images: ImageData[] = [];

  let fileInput: HTMLInputElement;
  let showCropModal = false;
  let imageToCropData: { 
    originalUrl: string;
    cropInfo?: {
      points: number[];
      zoom: number;
      orientation: number;
      viewportWidth: number;
      viewportHeight: number;
    };
  } | null = null;
  let imageIndexToCrop: number | null = null; // クロップ対象のインデックス

  onMount(() => {
    // ペーストイベントの処理
    document.addEventListener("paste", async (event: ClipboardEvent) => {
      if (!event.clipboardData) return;
      for (const item of event.clipboardData.items) {
        if (!item.type.startsWith(`image/`)) {
          continue;
        }
        const file = item.getAsFile();
        if (!file) continue;

        const url = await loadImageAsDataURL(file);
        // 新しい ImageData オブジェクトを作成して追加
        // ImageData 型から cropPoints が削除されたため、単純にオブジェクトを作成
        const newImage: ImageData = {
          id: crypto.randomUUID(),
          originalUrl: url,
          croppedUrl: null,
        };
        images = [...images, newImage];
      }
    });
  });

  // ファイル選択時の処理
  const onChange = async (evt: Event) => {
    const target = evt.target as HTMLInputElement;
    const files = target.files ?? [];
    if (files.length === 0) return;

    const newImages: ImageData[] = [];
    for (const file of files) {
      const url = await loadImageAsDataURL(file);
      // ImageData 型から cropPoints が削除されたため、単純にオブジェクトを作成
      newImages.push({
        id: crypto.randomUUID(),
        originalUrl: url,
        croppedUrl: null,
      });
    }
    images = [...images, ...newImages]; // 新しい画像データを追加
    target.value = ''; // input をリセット
  };

  // 編集ボタンクリック時の処理
  const openCropModal = (index: number) => {
    imageIndexToCrop = index;
    const targetImage = images[index];
    imageToCropData = {
      originalUrl: targetImage.originalUrl,
      cropInfo: targetImage.cropInfo, // 保存されているクロップ情報を渡す
    };
    showCropModal = true;
  };

  // クロップ完了時の処理
  const handleCropComplete = (event: CustomEvent<{ 
    croppedUrl: string;
    cropInfo: {
      points: number[];
      zoom: number;
      orientation: number;
      viewportWidth: number;
      viewportHeight: number;
    };
  }>) => {
    if (imageIndexToCrop === null) return;

    const { croppedUrl, cropInfo } = event.detail;
    const updatedImages = [...images];
    updatedImages[imageIndexToCrop] = {
      ...updatedImages[imageIndexToCrop],
      croppedUrl: croppedUrl, // クロップ後の URL を更新
      cropInfo: cropInfo, // クロップ情報を保存
    };
    images = updatedImages;

    closeModal();
  };

  // クロップキャンセル時の処理
  const handleCropCancel = () => {
    closeModal();
  };

  // 「クロップ前に戻す」ボタン処理
  const handleResetCrop = () => {
    if (imageIndexToCrop === null) return;

    const updatedImages = [...images];
    updatedImages[imageIndexToCrop] = {
      ...updatedImages[imageIndexToCrop],
      croppedUrl: null, // クロップ後 URL を null に戻す
      cropInfo: undefined, // クロップ情報もクリア
    };
    images = updatedImages;

    closeModal();
  };

  // モーダルを閉じる共通処理
  const closeModal = () => {
    showCropModal = false;
    imageToCropData = null;
    imageIndexToCrop = null;
  }

  // 画像削除処理
  const removeImage = (index: number) => {
    images = images.filter((_, i) => i !== index);
  };

  // 画像のクリップボードコピー（押下したボタンに対応する 1 枚のみ）
  let imageCopyState: { [id: string]: 'idle' | 'success' | 'fail' } = {};
  let imageCopyTimers: { [id: string]: ReturnType<typeof setTimeout> } = {};

  const copyImage = async (image: ImageData) => {
    // クロップ済みなら croppedUrl、未クロップなら originalUrl をコピー
    const url = image.croppedUrl ?? image.originalUrl;
    try {
      if (!navigator.clipboard || typeof ClipboardItem === 'undefined') {
        throw new Error('Clipboard API is unavailable');
      }
      const res = await fetch(url);
      const blob = await res.blob();
      await navigator.clipboard.write([new ClipboardItem({ [blob.type]: blob })]);
      imageCopyState[image.id] = 'success';
    } catch (error) {
      console.error('copyImage -> error:', error);
      imageCopyState[image.id] = 'fail';
    } finally {
      imageCopyState = { ...imageCopyState };
      if (imageCopyTimers[image.id]) clearTimeout(imageCopyTimers[image.id]);
      imageCopyTimers[image.id] = setTimeout(() => {
        imageCopyState[image.id] = 'idle';
        imageCopyState = { ...imageCopyState };
      }, 2000);
    }
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
  </div>

  <div class="d-flex flex-row gap-2 flex-wrap">
    {#each images as image, index (image.id)} <!-- key に image.id を使用 -->
    <div class="position-relative d-flex align-items-center justify-content-center" style="min-height: 100px; border: 1px solid #DFDFDF; border-radius: 3px;"> <!-- width: 100px を削除, min-height は維持 -->
      <!-- croppedUrl があればそれを、なければ originalUrl を表示 -->
      <img
        src={image.croppedUrl ?? image.originalUrl}
        alt={`preview ${index + 1}`}
        style="height: 100px; width: auto; object-fit: contain; display: block;" /> <!-- height: 100px, width: auto に変更 -->
      <!-- 削除ボタン -->
      <button
        class="btn btn-danger btn-sm position-absolute top-0 end-0 p-0 m-1 d-flex justify-content-center align-items-center"
        style="line-height: 1; width: 1.2rem; height: 1.2rem; border-radius: 50%; font-size: 0.8rem;"
        aria-label={`画像を削除 ${index + 1}`}
        on:click={() => removeImage(index)}
      >
        &times;
      </button>
      <!-- コピーボタン -->
      <button
        class="btn btn-sm position-absolute top-0 start-0 p-0 m-1 d-flex justify-content-center align-items-center {imageCopyState[image.id] === 'success' ? 'btn-success' : imageCopyState[image.id] === 'fail' ? 'btn-danger' : 'btn-primary'}"
        style="line-height: 1; width: 1.2rem; height: 1.2rem; border-radius: 50%; font-size: 0.7rem;"
        aria-label={imageCopyState[image.id] === 'success' ? `画像をコピーしました ${index + 1}` : imageCopyState[image.id] === 'fail' ? `画像のコピーに失敗 ${index + 1}` : `画像をコピー ${index + 1}`}
        title={imageCopyState[image.id] === 'success' ? 'コピーしました' : imageCopyState[image.id] === 'fail' ? 'コピー失敗' : '画像をコピー'}
        on:click={() => copyImage(image)}
      >
        {#if imageCopyState[image.id] === 'success'}
        &checkmark;
        {:else if imageCopyState[image.id] === 'fail'}
        !
        {:else}
        <!-- SVG for clipboard icon -->
        <svg xmlns="http://www.w3.org/2000/svg" width="1em" height="1em" fill="currentColor" class="bi bi-clipboard" viewBox="0 0 16 16">
          <path d="M4 1.5H3a2 2 0 0 0-2 2V14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V3.5a2 2 0 0 0-2-2h-1v1h1a1 1 0 0 1 1 1V14a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V3.5a1 1 0 0 1 1-1h1v-1z"/>
          <path d="M9.5 1a.5.5 0 0 1 .5.5v1a.5.5 0 0 1-.5.5h-3a.5.5 0 0 1-.5-.5v-1a.5.5 0 0 1 .5-.5h3zm-3-1A1.5 1.5 0 0 0 5 1.5v1A1.5 1.5 0 0 0 6.5 4h3A1.5 1.5 0 0 0 11 2.5v-1A1.5 1.5 0 0 0 9.5 0h-3z"/>
        </svg>
        {/if}
      </button>
      <!-- 編集ボタン -->
      <button
        class="btn btn-secondary btn-sm position-absolute bottom-0 end-0 p-0 m-1 d-flex justify-content-center align-items-center"
        style="line-height: 1; width: 1.2rem; height: 1.2rem; border-radius: 50%; font-size: 0.7rem;"
        aria-label={`画像を編集 ${index + 1}`}
        on:click={() => openCropModal(index)}
      >
        <!-- SVG for pencil icon -->
        <svg xmlns="http://www.w3.org/2000/svg" width="1em" height="1em" fill="currentColor" class="bi bi-pencil-fill" viewBox="0 0 16 16">
          <path d="M12.854.146a.5.5 0 0 0-.707 0L10.5 1.793 14.207 5.5l1.647-1.646a.5.5 0 0 0 0-.708l-3-3zm.646 6.061L9.793 2.5 3.293 9H3.5a.5.5 0 0 1 .5.5v.5h.5a.5.5 0 0 1 .5.5v.5h.5a.5.5 0 0 1 .5.5v.5h.5a.5.5 0 0 1 .5.5v.207l6.5-6.5zm-7.468 7.468A.5.5 0 0 1 6 13.5V13h-.5a.5.5 0 0 1-.5-.5V12h-.5a.5.5 0 0 1-.5-.5V11h-.5a.5.5 0 0 1-.5-.5V10h-.5a.499.499 0 0 1-.175-.032l-.179.178a.5.5 0 0 0-.11.168l-2 5a.5.5 0 0 0 .65.65l5-2a.5.5 0 0 0 .168-.11l.178-.178z"/>
        </svg>
      </button>
    </div>
    {/each}
  </div>

  <!-- クロップモーダル -->
  {#if showCropModal && imageToCropData}
    <ImageCropperModal
      imageUrl={imageToCropData.originalUrl}
      initialCropInfo={imageToCropData.cropInfo}
      bind:showModal={showCropModal}
      on:cropComplete={handleCropComplete}
      on:cropCancel={handleCropCancel}
      on:resetCrop={handleResetCrop}
    />
  {/if}

</div>
