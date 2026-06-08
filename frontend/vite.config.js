import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import aiProxy from './api/ai.js'
import searchProxy from './api/search.js'
import relayProxy from './api/relay.js'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '') // all vars (incl. non-VITE server-side)
  if (env.DEEPSEEK_API_KEY) process.env.DEEPSEEK_API_KEY = env.DEEPSEEK_API_KEY
  if (env.TAVILY_API_KEY) process.env.TAVILY_API_KEY = env.TAVILY_API_KEY
  if (env.ALLOWED_ORIGIN) process.env.ALLOWED_ORIGIN = env.ALLOWED_ORIGIN
  // 1Shot Managed API creds — server-side only, never exposed to the client bundle.
  if (env.ONESHOT_KEY) process.env.ONESHOT_KEY = env.ONESHOT_KEY
  if (env.ONESHOT_SECRET) process.env.ONESHOT_SECRET = env.ONESHOT_SECRET
  if (env.ONESHOT_BIZ_ID) process.env.ONESHOT_BIZ_ID = env.ONESHOT_BIZ_ID

  const apiProxyPlugin = {
    name: 'api-proxy',
    configureServer(s) {
      s.middlewares.use('/api/ai', aiProxy)
      s.middlewares.use('/api/search', searchProxy)
      s.middlewares.use('/api/relay', relayProxy)
    },
    configurePreviewServer(s) {
      s.middlewares.use('/api/ai', aiProxy)
      s.middlewares.use('/api/search', searchProxy)
      s.middlewares.use('/api/relay', relayProxy)
    },
  }

  return {
    plugins: [react(), apiProxyPlugin],
    root: '.',
    build: {
      outDir: 'dist',
      rollupOptions: { external: [] }
    },
    server: {
      historyApiFallback: true,
    },
    preview: {
      historyApiFallback: true,
    },
    optimizeDeps: {
      include: ['react-force-graph-2d']
    },
    test: {
      environment: 'jsdom',
      exclude: ['**/node_modules/**', '**/e2e/**']
    }
  }
})
