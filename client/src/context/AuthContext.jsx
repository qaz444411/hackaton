import { createContext, useContext, useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { io } from 'socket.io-client';
import { getMe, getMyPage } from '../api/endpoints.js';
import { showNotification } from '../lib/notify.js';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const qc = useQueryClient();

  useEffect(() => {
    if (!localStorage.getItem('token')) return setLoading(false);
    getMe().then(setUser).catch(() => localStorage.removeItem('token')).finally(() => setLoading(false));
  }, []);

  // 알림 설정(채팅·매칭 알림 on/off) — 페이지를 오가도 계속 유지되는 실시간 연결이
  // 어떤 이벤트에 브라우저 알림을 띄울지 판단하려면 이 값이 항상 최신이어야 한다.
  const { data: mypage } = useQuery({
    queryKey: ['mypage'], queryFn: getMyPage, enabled: !!user, staleTime: 30000,
  });
  const notify = mypage?.notify;

  // 실시간 연결 — 특정 화면(보관함/채팅목록)에만 붙어 있으면 다른 화면을 보는 동안
  // 새 메시지가 와도 아무도 못 듣는다. 로그인 상태인 동안 앱 전체에서 하나만 유지한다.
  useEffect(() => {
    const token = localStorage.getItem('token');
    if (!user || !token) return;

    const socket = io(import.meta.env.VITE_SOCKET_URL || 'http://localhost:4000', { auth: { token } });

    socket.on('inbox:new', ({ fromNickname }) => {
      qc.invalidateQueries({ queryKey: ['home'] });
      qc.invalidateQueries({ queryKey: ['inbox'] });
      if (notify?.match_push) {
        showNotification('새 매칭 요청', `${fromNickname}님이 같이 밥 먹재요`, { tag: 'inbox' });
      }
    });

    socket.on('chat:new', ({ matchId, senderNickname, preview }) => {
      if (notify?.chat_push) {
        showNotification(senderNickname, preview, {
          tag: `chat-${matchId}`,
          onClick: () => { window.location.href = `/chats/${matchId}`; },
        });
      }
    });

    return () => socket.disconnect();
  }, [user, notify?.match_push, notify?.chat_push, qc]);

  const signIn = ({ token, user: u }) => {
    localStorage.setItem('token', token);
    setUser(u);
  };
  const signOut = () => {
    localStorage.removeItem('token');
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, setUser, signIn, signOut, loading }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
