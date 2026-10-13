import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5180,
    // 5173 은 다른 프로젝트가 쓴다. 포트가 차 있으면 다른 번호로 슬쩍 옮기지 말고 실패한다 — CORS 허용 출처가 이 번호 하나다.
    strictPort: true,
    proxy: {
      // 개발 중 /api 요청을 백엔드(8081)로 프록시
      '/api': {
        target: 'http://localhost:8081',
        changeOrigin: true,
      },
    },
  },
})
