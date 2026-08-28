import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    // host: true → 0.0.0.0 바인딩. 같은 Wi-Fi 의 휴대폰에서 http://<PC IP>:5173 으로 접속 가능
    host: true,
    // Cloudflare 터널(https://xxx.trycloudflare.com)로 들어오는 요청을 허용한다.
    // Vite 5.4.12+ 는 Host 헤더를 검사해서 모르는 호스트를 막기 때문에 이게 없으면
    // 터널 주소로 열었을 때 "Blocked request" 가 뜬다.
    // 휴대폰에서 현재 위치(geolocation)를 쓰려면 https 가 필수라 터널을 쓴다.
    allowedHosts: ['.trycloudflare.com', '.ngrok-free.app', 'localhost'],
    // 터널은 443(wss)으로 들어오므로 HMR 소켓 주소를 맞춰 준다.
    // 로컬(http://localhost:5173)로 열 때는 Vite 가 알아서 처리한다.
    hmr: { clientPort: process.env.VITE_TUNNEL ? 443 : undefined,
           protocol: process.env.VITE_TUNNEL ? 'wss' : undefined },
    proxy: {
      '/api': 'http://localhost:4000',
      // Socket.IO 는 웹소켓 업그레이드가 필요하므로 ws: true
      '/socket.io': { target: 'http://localhost:4000', ws: true },
    },
  },
});
