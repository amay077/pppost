import { defineConfig } from "vite";
import { svelte } from "@sveltejs/vite-plugin-svelte";
import { VitePWA, VitePWAOptions } from 'vite-plugin-pwa'  // これを追加

const pwaOptions: Partial<VitePWAOptions> = {
  strategies: 'generateSW' as 'generateSW', // デフォルトなので不要
  manifest: {
    name: 'PPPOST',
    short_name: 'PPPOST',
    description: 'Multi post for SNS',
    icons: [
      {
        src: 'app.png',
        sizes: '100x100',
        type: 'image/png',
      },
    ],
    start_url: 'index.html',
    display: 'standalone',
    background_color: '#ECFFE6',
    theme_color: '#399918',
    lang: 'ja',
    share_target: {
      action: './index.html',
      params: {
        title: 'title',
        text: 'text',
        url: 'url'
      }
    }
  },
  // includeAssets: ['ui_icon/*.svg'],
  // devOptions: {
  //   enabled: true,
  // },
}

// https://vitejs.dev/config/
export default defineConfig({
  base: "./",
  plugins: [svelte(), VitePWA(pwaOptions)],

  css: {
    preprocessorOptions: {
      scss: {
        additionalData: '@use "src/variables.scss" as *;',
      },
    },
  },
});
