import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { crx } from '@crxjs/vite-plugin'
import manifest from './src/manifest'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    react(),
    crx({ 
      manifest,
      // Enable content script HMR for better development experience
      contentScripts: {
        injectCss: true,
      },
    })
  ],
  server: {
    port: 3000,
    // Enable HMR for live reload
    hmr: {
      port: 3000,
    },
  },
  // Use esbuild to transform TypeScript in content scripts
  esbuild: {
    include: /src\/.*\.tsx?$/,
    exclude: [],
  },
  build: {
    rollupOptions: {
      input: {
        dashboard: 'dashboard.html',
        'content/etsyEditor': 'src/content/etsyEditor.ts',
        'sidepanel-etsy': 'sidepanel-etsy.html',
        'sidepanel-google-sheets': 'sidepanel-google-sheets.html',
        'sidepanel-default': 'sidepanel-default.html',
      },
    },
  },
})

