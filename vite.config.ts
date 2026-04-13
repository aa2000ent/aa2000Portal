import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const proxyTarget = env.VITE_API_BASE_URL?.trim() || ''

  return {
  plugins: [react(), tailwindcss()],
  server: {
    proxy: proxyTarget
      ? {
          '^/__portal_api': {
            target: proxyTarget,
            changeOrigin: true,
            secure: true,
            rewrite: (path) => path.replace(/^\/__portal_api/, ''),
          },
        }
      : undefined,
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks: (id) => {
          if (id.includes('node_modules')) {
            if (id.includes('react-dom') || id.includes('react/')) return 'vendor-react'
            if (id.includes('react-router')) return 'vendor-router'
            if (id.includes('leaflet')) return 'vendor-leaflet'
            if (id.includes('recharts')) return 'vendor-recharts'
            if (id.includes('lucide-react')) return 'vendor-lucide'
            return 'vendor'
          }
        },
        chunkFileNames: 'assets/[name]-[hash].js',
        entryFileNames: 'assets/[name]-[hash].js',
        assetFileNames: 'assets/[name]-[hash][extname]',
      },
    },
    chunkSizeWarningLimit: 600,
  },
  }
})
