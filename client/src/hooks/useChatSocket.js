import { useEffect, useRef, useState } from 'react';
import { io } from 'socket.io-client';

/** 채팅 실시간 소켓 — 서버 chatSocket.js 와 이벤트 이름이 1:1 대응 */
export function useChatSocket(matchId, onMessage) {
  const socketRef = useRef(null);
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    if (!matchId) return;
    const socket = io(import.meta.env.VITE_SOCKET_URL || 'http://localhost:4000', {
      auth: { token: localStorage.getItem('token') },
    });
    socketRef.current = socket;
    socket.on('connect', () => { setConnected(true); socket.emit('room:join', Number(matchId)); });
    socket.on('disconnect', () => setConnected(false));
    socket.on('message:new', onMessage);
    return () => socket.disconnect();
  }, [matchId]);

  const send = (content) =>
    new Promise((resolve) =>
      socketRef.current?.emit('message:send', { matchId: Number(matchId), content }, resolve));

  return { connected, send };
}
