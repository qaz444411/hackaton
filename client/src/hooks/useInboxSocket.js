import { useEffect } from 'react';
import { io } from 'socket.io-client';
import { useQueryClient } from '@tanstack/react-query';

/**
 * 보관함 실시간 배지 — 서버가 접속 시 자동으로 개인 방(user:내ID)에 넣어주므로
 * 특정 채팅방(room:join)과 달리 그냥 연결만 하면 된다.
 * 새 요청이 오면 홈의 inboxNewCount 를 바로 다시 불러온다(폴링 없이 즉시 반영).
 */
export function useInboxSocket() {
  const qc = useQueryClient();

  useEffect(() => {
    const token = localStorage.getItem('token');
    if (!token) return;
    const socket = io(import.meta.env.VITE_SOCKET_URL || 'http://localhost:4000', { auth: { token } });
    socket.on('inbox:new', () => {
      qc.invalidateQueries({ queryKey: ['home'] });
      qc.invalidateQueries({ queryKey: ['inbox'] });
    });
    return () => socket.disconnect();
  }, [qc]);
}
