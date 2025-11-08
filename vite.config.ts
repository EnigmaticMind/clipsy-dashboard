import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { crx } from '@crxjs/vite-plugin'
import manifest from './src/manifest'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    react(),
    crx({ manifest })
  ],
  server: {
    port: 3000,
  },
  build: {
    rollupOptions: {
      input: {
        dashboard: 'dashboard.html',
        'content/etsyEditor': 'src/content/etsyEditor.ts',
      },
    },
  },
})

