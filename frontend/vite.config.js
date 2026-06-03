import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import aiProxy from './api/ai.js'
import searchProxy from './api/search.js'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '') // all vars (incl. non-VITE server-side)
  if (env.DEEPSEEK_API_KEY) process.env.DEEPSEEK_API_KEY = env.DEEPSEEK_API_KEY
  if (env.TAVILY_API_KEY) process.env.TAVILY_API_KEY = env.TAVILY_API_KEY
  if (env.ALLOWED_ORIGIN) process.env.ALLOWED_ORIGIN = env.ALLOWED_ORIGIN

  const apiProxyPlugin = {
    name: 'api-proxy',
    configureServer(s) {
      s.middlewares.use('/api/ai', aiProxy)
      s.middlewares.use('/api/search', searchProxy)
    },
    configurePreviewServer(s) {
      s.middlewares.use('/api/ai', aiProxy)
      s.middlewares.use('/api/search', searchProxy)
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
    }
  }
})
