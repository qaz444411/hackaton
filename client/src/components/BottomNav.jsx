import { NavLink } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { getHome } from '../api/endpoints.js';

/** 하단 네비게이션 — 홈 / 지도 / 채팅 / 보관함 */
export default function BottomNav() {
  const { data } = useQuery({ queryKey: ['home'], queryFn: getHome, refetchInterval: 30000 });
  const newCount = data?.inboxNewCount || 0;

  return (
    <nav className="bottom-nav">
      <NavLink to="/home">🏠<span>홈</span></NavLink>
      <NavLink to="/map">🗺️<span>지도</span></NavLink>
      <NavLink to="/chats">💬<span>채팅</span></NavLink>
      <NavLink to="/inbox">
        📥<span>보관함</span>
        {newCount > 0 && <em className="badge">{newCount}</em>}
      </NavLink>
    </nav>
  );
}
