import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import https from 'node:https'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const apiTarget = (env.VITE_API_BASE_URL || '').replace(/\/$/, '')

  // Agent that accepts self-signed / Tailscale HTTPS certs
  const agent = new https.Agent({ rejectUnauthorized: false })

  return {
    plugins: [react(), tailwindcss()],
    server: {
      cors: {
        origin: true,
        credentials: true,
      },
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET,POST,PUT,PATCH,DELETE,OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Session-Id',
      },
      // Proxy all /__portal_api/* requests to the real backend — avoids CORS in dev
      ...(apiTarget
        ? {
            proxy: {
              '/__portal_api': {
                target: apiTarget,
                changeOrigin: true,
                secure: false,
                agent: apiTarget.startsWith('https') ? agent : undefined,
                rewrite: (path: string) => path.replace(/^\/__portal_api/, ''),
                configure: (proxy) => {
                  proxy.on('proxyReq', (proxyReq) => {
                    proxyReq.setHeader('Origin', apiTarget)
                  })
                },
              },
            },
          }
        : {}),
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
    optimizeDeps: {
      include: ['read-excel-file/browser']
    }
  }
})
