import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

const apiProxyTarget = process.env.VITE_API_PROXY_TARGET || 'http://localhost:3103'

export default defineConfig({
  base: '/react/',
  plugins: [react(), tailwindcss()],
  build: {
    outDir: '../PaymentApi/public/react',
    emptyOutDir: true,
  },
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: apiProxyTarget,
        changeOrigin: true,
      },
    },
  },
})
