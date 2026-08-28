import { NavLink } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Home, MessageCircle, Archive } from 'lucide-react';
import { getHome } from '../api/endpoints.js';
import './BottomNav.css';

const ITEMS = [
  { to: '/home', Icon: Home, label: '홈' },
  { to: '/chats', Icon: MessageCircle, label: '채팅' },
  { to: '/inbox', Icon: Archive, label: '보관함' },
];

/** 하단 네비게이션 — 홈 / 채팅 / 보관함 (지도는 홈에서 진입) */
export default function BottomNav() {
  const { data } = useQuery({ queryKey: ['home'], queryFn: getHome, refetchInterval: 30000 });
  const newCount = data?.inboxNewCount || 0;

  return (
    <nav className="bnav">
      {ITEMS.map(({ to, Icon, label }) => (
        <NavLink
          key={to}
          to={to}
          className={({ isActive }) => `bnav__btn${isActive ? ' active' : ''}`}
        >
          <span className="bnav__icon-wrap">
            <Icon className="bnav__icon" size={22} strokeWidth={2} />
            {to === '/inbox' && newCount > 0 && (
              <span className="bnav__badge">{newCount > 9 ? '9+' : newCount}</span>
            )}
          </span>
          <span className="bnav__label">{label}</span>
        </NavLink>
      ))}
    </nav>
  );
}
