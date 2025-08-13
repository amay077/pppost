<script lang="ts">
  import { createEventDispatcher, onMount, onDestroy } from 'svelte';
  import Croppie from 'croppie';
  import 'croppie/croppie.css'; // CSS をインポート

  export let imageUrl: string; // ★常に元画像の Data URL を受け取るように変更
  export let showModal: boolean = false; // モーダルの表示状態
  // export let initialCropPoints: number[] | undefined = undefined; // クロップ領域再現不要のため削除

  // cropComplete イベントで返すデータの型を定義 (cropPoints を削除)
  interface CropResult {
    croppedUrl: string;
  }
  const dispatch = createEventDispatcher<{ cropComplete: CropResult; cropCancel: void; resetCrop: void }>(); // resetCrop イベントを追加

  let croppieInstance: Croppie | null = null;
  let cropperElement: HTMLElement; // Croppie をバインドする要素
  let viewportSize = { width: 300, height: 300 }; // ビューポートサイズを管理

  // Croppie のオプション
  // より大きなboundaryサイズに設定し、画像全体が表示されやすくする
  const croppieOptions: Croppie.CroppieOptions = {
    viewport: { width: viewportSize.width, height: viewportSize.height }, // 初期ビューポートサイズ
    boundary: { width: 450, height: 450 }, // Croppie 全体のサイズを大きく
    enableExif: true, // EXIF情報を考慮して回転を補正
    enableResize: false, // ビューポートのリサイズは手動で管理
    showZoomer: true, // ズームスライダーを表示
    enableOrientation: true, // 回転機能を有効化
  };

  onMount(() => {
    // モーダルが表示されたときに Croppie を初期化
    // Svelte のライフサイクルと Croppie の初期化タイミングを考慮
    // showModal が true で渡された場合に初期化を試みる
    if (showModal && cropperElement && imageUrl) {
      initializeCroppie();
    }
  });

  // showModal または imageUrl が変更されたときに再初期化を試みる
  // Croppie インスタンスがすでにある場合は破棄してから再生成
  $: {
    if (showModal && cropperElement && imageUrl) {
      // すでにインスタンスがある場合、URLが変更されたらbindし直す
      if (croppieInstance) {
         croppieInstance.bind({ 
           url: imageUrl,
           zoom: 0 // 初期ズームレベルを0（最小）に設定
         });
      } else {
        initializeCroppie();
      }
    } else if (!showModal && croppieInstance) {
      destroyCroppie(); // モーダルが非表示になったら破棄
    }
  }


  function initializeCroppie() {
    // 既存のインスタンスがあれば破棄 (念のため)
    if (croppieInstance) {
      destroyCroppie();
    }
    if (cropperElement) { // 要素が存在することを確認
        croppieInstance = new Croppie(cropperElement, croppieOptions);
        croppieInstance.bind({
          url: imageUrl,
          zoom: 0, // 初期ズームレベルを0（最小）に設定して全体を表示
          // points: initialCropPoints, // 初期クロップ領域の設定を削除
        });
    } else {
        console.error("Cropper element not found during initialization.");
    }
  }

  function destroyCroppie() {
    if (croppieInstance) {
      croppieInstance.destroy();
      croppieInstance = null;
    }
  }

  onDestroy(() => {
    // コンポーネント破棄時にも Croppie インスタンスを破棄
    destroyCroppie();
  });

  async function handleCrop() {
    if (!croppieInstance) return;
    try {
      // クロップ結果を Data URL (base64) で取得
      const croppedUrl = await croppieInstance.result({
        type: 'canvas',
        size: 'original',
        format: 'png',
        quality: 1,
        circle: false
      });

      // 結果を親に通知 (cropPoints を削除)
      dispatch('cropComplete', { croppedUrl: croppedUrl });
      // closeModal(); // 親コンポーネントで showModal を false にする
    } catch (error) {
      console.error('Cropping failed:', error);
      // エラー処理 (例: ユーザーに通知)
      alert('画像のクロップに失敗しました。');
      handleCancel(); // エラー時はキャンセル扱い
    }
  }

  function handleCancel() {
    dispatch('cropCancel');
  }

  // 「クロップ前に戻す」ボタンの処理
  function handleReset() {
    dispatch('resetCrop'); // リセットイベントを親に通知
  }

  // ビューポートサイズを変更する関数
  function adjustViewportSize(dimension: 'width' | 'height', delta: number) {
    if (!croppieInstance) return;
    
    // 新しいサイズを計算（最小100px、最大400px）
    const newViewportSize = { ...viewportSize };
    if (dimension === 'width') {
      newViewportSize.width = Math.max(100, Math.min(400, viewportSize.width + delta));
    } else {
      newViewportSize.height = Math.max(100, Math.min(400, viewportSize.height + delta));
    }
    viewportSize = newViewportSize;
    
    // Croppieインスタンスを再初期化
    const currentOptions = croppieInstance.get();
    destroyCroppie();
    
    // 新しいビューポートサイズで再初期化
    const newCroppieOptions = {
      ...croppieOptions,
      viewport: { width: newViewportSize.width, height: newViewportSize.height }
    };
    
    if (cropperElement) {
      croppieInstance = new Croppie(cropperElement, newCroppieOptions);
      croppieInstance.bind({
        url: imageUrl,
        zoom: currentOptions.zoom || 0,
        orientation: currentOptions.orientation || 1,
        points: currentOptions.points
      });
    }
  }

  // アスペクト比を設定する関数
  function setAspectRatio(ratio: string) {
    if (!croppieInstance) return;
    
    let newWidth = viewportSize.width;
    let newHeight = viewportSize.height;
    
    // アスペクト比に基づいて新しいサイズを計算
    switch (ratio) {
      case '1:1':
        newHeight = newWidth;
        break;
      case '4:3':
        newHeight = Math.round(newWidth * 3 / 4);
        break;
      case '16:9':
        newHeight = Math.round(newWidth * 9 / 16);
        break;
      case '3:4':
        newHeight = Math.round(newWidth * 4 / 3);
        break;
      case '9:16':
        newHeight = Math.round(newWidth * 16 / 9);
        break;
    }
    
    // 制限値内に収める
    if (newHeight > 400) {
      newHeight = 400;
      switch (ratio) {
        case '1:1':
          newWidth = newHeight;
          break;
        case '4:3':
          newWidth = Math.round(newHeight * 4 / 3);
          break;
        case '16:9':
          newWidth = Math.round(newHeight * 16 / 9);
          break;
        case '3:4':
          newWidth = Math.round(newHeight * 3 / 4);
          break;
        case '9:16':
          newWidth = Math.round(newHeight * 9 / 16);
          break;
      }
    }
    
    // 幅も制限値内に収める
    newWidth = Math.max(100, Math.min(400, newWidth));
    newHeight = Math.max(100, Math.min(400, newHeight));
    
    viewportSize = { width: newWidth, height: newHeight };
    
    // Croppieインスタンスを再初期化
    const currentOptions = croppieInstance.get();
    destroyCroppie();
    
    const newCroppieOptions = {
      ...croppieOptions,
      viewport: { width: newWidth, height: newHeight }
    };
    
    if (cropperElement) {
      croppieInstance = new Croppie(cropperElement, newCroppieOptions);
      croppieInstance.bind({
        url: imageUrl,
        zoom: currentOptions.zoom || 0,
        orientation: currentOptions.orientation || 1,
        points: currentOptions.points
      });
    }
  }

</script>

{#if showModal}
<div class="modal-backdrop" on:click|self={handleCancel} > <!-- 背景クリックでキャンセル -->
  <div class="modal-dialog" role="dialog" aria-modal="true" aria-labelledby="cropModalTitle">
    <div class="modal-content">
      <div class="modal-header">
        <h5 class="modal-title" id="cropModalTitle">画像をクロップ</h5>
        <button type="button" class="btn-close" aria-label="Close" on:click={handleCancel}></button>
      </div>
      <div class="modal-body">
        <div class="cropper-container">
          <!-- Croppie をバインドする要素 -->
          <div bind:this={cropperElement}></div>
          <!-- ビューポートサイズ調整ボタン -->
          <div class="viewport-controls">
            <!-- アスペクト比ボタン -->
            <div class="aspect-ratio-buttons">
              <button type="button" class="btn btn-sm btn-outline-primary" on:click={() => setAspectRatio('1:1')}>1:1</button>
              <button type="button" class="btn btn-sm btn-outline-primary" on:click={() => setAspectRatio('4:3')}>4:3</button>
              <button type="button" class="btn btn-sm btn-outline-primary" on:click={() => setAspectRatio('16:9')}>16:9</button>
              <button type="button" class="btn btn-sm btn-outline-primary" on:click={() => setAspectRatio('3:4')}>3:4</button>
              <button type="button" class="btn btn-sm btn-outline-primary" on:click={() => setAspectRatio('9:16')}>9:16</button>
            </div>
            <!-- サイズ調整ボタン -->
            <div class="size-controls">
              <div class="viewport-dimension">
                <span class="dimension-label">幅:</span>
                <button type="button" class="btn btn-sm btn-outline-secondary" on:click={() => adjustViewportSize('width', -25)} disabled={viewportSize.width <= 100}>
                  <span aria-hidden="true">−</span>
                </button>
                <button type="button" class="btn btn-sm btn-outline-secondary" on:click={() => adjustViewportSize('width', 25)} disabled={viewportSize.width >= 400}>
                  <span aria-hidden="true">+</span>
                </button>
              </div>
              <div class="viewport-dimension">
                <span class="dimension-label">高さ:</span>
                <button type="button" class="btn btn-sm btn-outline-secondary" on:click={() => adjustViewportSize('height', -25)} disabled={viewportSize.height <= 100}>
                  <span aria-hidden="true">−</span>
                </button>
                <button type="button" class="btn btn-sm btn-outline-secondary" on:click={() => adjustViewportSize('height', 25)} disabled={viewportSize.height >= 400}>
                  <span aria-hidden="true">+</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
      <div class="modal-footer">
        <button type="button" class="btn btn-warning" on:click={handleReset}>クロップ前に戻す</button> <!-- リセットボタン追加 -->
        <button type="button" class="btn btn-secondary" on:click={handleCancel}>キャンセル</button>
        <button type="button" class="btn btn-primary" on:click={handleCrop}>確定</button>
      </div>
    </div>
  </div>
</div>
{/if}

<style>
  .modal-backdrop {
    position: fixed;
    top: 0;
    left: 0;
    width: 100vw;
    height: 100vh;
    background-color: rgba(0, 0, 0, 0.5);
    display: flex;
    justify-content: center;
    align-items: center;
    z-index: 1050; /* 必要に応じて調整 */
  }

  .modal-dialog {
    /* Bootstrap のスタイルを参考に */
    background-color: white;
    border-radius: 0.3rem;
    max-width: 600px; /* モーダルの最大幅を広げる */
    width: 90%;
    box-shadow: 0 0.5rem 1rem rgba(0,0,0,.15);
    display: flex; /* Ensure content takes up space */
    flex-direction: column; /* Stack header, body, footer */
    max-height: 90vh; /* Prevent modal from being too tall */
  }

  .modal-content {
     /* Bootstrap のスタイルを参考に */
     display: flex;
     flex-direction: column;
     border: 1px solid rgba(0,0,0,.2);
     border-radius: 0.3rem;
     outline: 0;
     overflow: hidden; /* Ensure rounded corners clip content */
     height: 100%; /* Fill the dialog */
  }

  .modal-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 1rem 1rem;
    border-bottom: 1px solid #dee2e6;
    flex-shrink: 0; /* Prevent header from shrinking */
  }

   .modal-title {
     margin-bottom: 0;
     line-height: 1.5;
   }

  .modal-body {
    position: relative;
    flex: 1 1 auto; /* Allow body to grow and shrink */
    padding: 1rem;
    display: flex; /* Center Croppie */
    justify-content: center;
    align-items: center;
    overflow-y: auto; /* Add scroll if content overflows */
  }

  .cropper-container {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 1rem;
  }

  .viewport-controls {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
    align-items: center;
    margin-top: 0.5rem;
  }

  .aspect-ratio-buttons {
    display: flex;
    gap: 0.25rem;
    flex-wrap: wrap;
    justify-content: center;
  }

  .size-controls {
    display: flex;
    gap: 1rem;
    justify-content: center;
  }

  .viewport-dimension {
    display: flex;
    align-items: center;
    gap: 0.25rem;
  }

  .dimension-label {
    font-size: 0.875rem;
    color: #495057;
    margin-right: 0.25rem;
  }


  .modal-footer {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: flex-end;
    padding: 0.75rem;
    border-top: 1px solid #dee2e6;
    flex-shrink: 0; /* Prevent footer from shrinking */
  }

  .modal-footer > * {
    margin: 0.25rem;
  }

  /* Croppie のデフォルトスタイルを上書きする場合 */
  /* :global() を使って Croppie の内部要素にスタイルを適用 */
  :global(.cr-boundary) {
    /* boundary のサイズは options で設定 */
  }
  :global(.cr-viewport) {
    border: 2px dashed #fff; /* 破線に変更 */
    box-shadow: 0 0 0 2000px rgba(0, 0, 0, 0.5); /* ビューポート外を暗くする */
  }

  /* Bootstrap の btn-close スタイルがない場合 */
  .btn-close {
    box-sizing: content-box;
    width: 1em;
    height: 1em;
    padding: .25em .25em;
    color: #000;
    background: transparent url("data:image/svg+xml,%3csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16' fill='%23000'%3e%3cpath d='M.293.293a1 1 0 0 1 1.414 0L8 6.586 14.293.293a1 1 0 1 1 1.414 1.414L9.414 8l6.293 6.293a1 1 0 0 1-1.414 1.414L8 9.414l-6.293 6.293a1 1 0 0 1-1.414-1.414L6.586 8 .293 1.707a1 1 0 0 1 0-1.414z'/%3e%3c/svg%3e") center/1em auto no-repeat;
    border: 0;
    border-radius: .25rem;
    opacity: .5;
    cursor: pointer;
    transition: opacity .15s ease-in-out;
  }
  .btn-close:hover {
    opacity: .75;
  }
  .btn-close:focus {
    outline: 0;
    box-shadow: 0 0 0 .25rem rgba(13,110,253,.25); /* Adjust color if needed */
    opacity: 1;
  }

</style>