import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

declare const process: { env: Record<string, string | undefined> } // avoids pulling in @types/node for one line

// The backend has no CORS setup; the dev server proxies /api to it instead.
// API_PORT lets a second copy (e.g. a demo database) run alongside the normal one.
export default defineConfig({
  plugins: [react()],
  server: {
    host: '127.0.0.1',
    port: 5173,
    // Keep the browser's Host header: the backend refuses writes whose Origin doesn't match Host (CSRF check).
    proxy: { '/api': { target: `http://127.0.0.1:${process.env.API_PORT ?? 8000}`, changeOrigin: false } },
  },
})
