import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    // host: true → 0.0.0.0 바인딩. 같은 Wi-Fi 의 휴대폰에서 http://<PC IP>:5173 으로 접속 가능
    host: true,
    proxy: {
      '/api': 'http://localhost:4000',
      // Socket.IO 는 웹소켓 업그레이드가 필요하므로 ws: true
      '/socket.io': { target: 'http://localhost:4000', ws: true },
    },
  },
});
