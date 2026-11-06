import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

// No GitHub Pages o site fica em /<repositório>/, não na raiz: o workflow de
// deploy passa BASE_PATH=/GeeP/. Localmente continua '/'.
const base = process.env.BASE_PATH ?? '/'

// https://vite.dev/config/
export default defineConfig({
  base,
  // lightweight-charts + BIP32 + React passam um pouco dos 500 kB (≈190 kB gzip).
  build: { chunkSizeWarningLimit: 700 },
  plugins: [
    react(),
    // O service worker guarda só a casca do app (JS, CSS, ícones). Os dados das
    // APIs NÃO passam por ele: quem guarda é o cache do React Query no
    // IndexedDB (lib/query.ts), que sabe a validade de cada consulta. Assim o
    // app abre offline com o último retrato, sem dois caches brigando.
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: false,
      includeAssets: ['favicon.svg', 'icons/*.png'],
      manifest: {
        id: base,
        name: 'GeeP — Portfólio cripto',
        short_name: 'GeeP',
        description: 'Carteiras públicas de BTC, ETH e SOL, preço médio e indicadores de mercado num lugar só.',
        lang: 'pt-BR',
        start_url: base,
        scope: base,
        display: 'standalone',
        orientation: 'any',
        background_color: '#0b0d12',
        theme_color: '#0b0d12',
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: 'icons/maskable-192.png', sizes: '192x192', type: 'image/png', purpose: 'maskable' },
          { src: 'icons/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,png,svg,woff2}'],
        navigateFallback: 'index.html',
        cleanupOutdatedCaches: true,
      },
    }),
  ],
})
