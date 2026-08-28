import { createContext, useContext, useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { io } from 'socket.io-client';
import { getMe, getMyPage } from '../api/endpoints.js';
import { showNotification } from '../lib/notify.js';
import { loadA11y, applyA11y } from '../lib/a11y.js';

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

    // 진짜 랜덤 매칭 — 먼저 기다리던 쪽은 홈 화면 버튼이 카운트다운을 보여주고 있다가
    // 상대가 붙는 순간 바로 갱신돼야 한다(5초 폴링도 있지만 이걸로 더 빠르게 반영한다).
    socket.on('blind:matched', () => {
      qc.invalidateQueries({ queryKey: ['matching', 'current'] });
      qc.invalidateQueries({ queryKey: ['home'] });
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

  // 화면 크게 보기(글씨 크기/볼드) — 계정별로 저장해두고 로그인할 때마다,
  // 페이지를 옮겨 다녀도 계속 적용되게 여기(앱 전역)에서 한 번만 처리한다.
  // 창 폭이 모바일 기준을 넘나들면(430px) 확대 적용 여부가 바뀌어야 해서 resize 에도 다시 건다.
  useEffect(() => {
    const reapply = () => applyA11y(user ? loadA11y(user.id) : null);
    reapply();
    window.addEventListener('resize', reapply);
    return () => window.removeEventListener('resize', reapply);
  }, [user?.id]);

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
