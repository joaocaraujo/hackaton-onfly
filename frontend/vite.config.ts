import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    // Túneis quick (cloudflared) mudam de hostname; ".trycloudflare.com" libera todos.
    allowedHosts: [
      '.trycloudflare.com',
      'breaking-released-teaches-sewing.trycloudflare.com',
    ],
  },
})
