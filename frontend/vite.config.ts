import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// Port 3000 is the origin the backend's CORS allows. The proxy lets the browser call the API on the same
// origin during development, so no backend change is needed and no credentials are exposed to the page.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 3000,
    proxy: {
      '/api': {
        target: process.env.VITE_API_PROXY_TARGET ?? 'http://localhost:4000',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, ''),
      },
    },
  },
})
