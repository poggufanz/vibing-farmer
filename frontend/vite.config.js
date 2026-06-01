import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import aiProxy from './api/ai.js'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '') // all vars (incl. non-VITE server-side)
  if (env.DEEPSEEK_API_KEY) process.env.DEEPSEEK_API_KEY = env.DEEPSEEK_API_KEY

  const aiProxyPlugin = {
    name: 'ai-proxy',
    configureServer(s) { s.middlewares.use('/api/ai', aiProxy) },
    configurePreviewServer(s) { s.middlewares.use('/api/ai', aiProxy) },
  }

  return {
    plugins: [react(), aiProxyPlugin],
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
