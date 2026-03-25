import { dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const rootDir = dirname(fileURLToPath(import.meta.url))
  const env = loadEnv(mode, rootDir, '')
  const apiTarget = env.VITE_API_BASE_URL || 'http://127.0.0.1:8000'

  return {
    plugins: [react()],
    server: {
      proxy: {
        '/api': {
          target: apiTarget,
          changeOrigin: true,
        },
        '/sanctum': {
          target: apiTarget,
          changeOrigin: true,
        },
        '/storage': {
          target: apiTarget,
          changeOrigin: true,
        },
        '/broadcasting': {
          target: apiTarget,
          changeOrigin: true,
        },
      },
    },
  }
})
