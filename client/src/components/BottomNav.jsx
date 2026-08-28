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

/**
 * 하단 네비게이션 — 홈 / 채팅 / 보관함 (지도는 홈에서 진입)
 * floating: 뒤 콘텐츠(지도, 목록)가 하단바 밑까지 꽉 차게 깔리고 알약이 그 위에 뜬다.
 * 기존 페이지들의 레이아웃은 그대로 유지해야 해서 opt-in으로만 켠다.
 */
export default function BottomNav({ floating = false }) {
  const { data } = useQuery({ queryKey: ['home'], queryFn: getHome, refetchInterval: 30000 });
  const inboxCount = data?.inboxNewCount || 0;
  const chatCount = data?.chatUnreadCount || 0;
  const badgeFor = { '/inbox': inboxCount, '/chats': chatCount };

  return (
    <div className={`bnav-wrap${floating ? ' bnav-wrap--floating' : ''}`}>
      <nav className="bnav">
        {ITEMS.map(({ to, Icon, label }) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) => `bnav__btn${isActive ? ' active' : ''}`}
          >
            <span className="bnav__icon-wrap">
              <Icon className="bnav__icon" size={22} strokeWidth={2} />
              {badgeFor[to] > 0 && (
                <span className="bnav__badge">{badgeFor[to] > 9 ? '9+' : badgeFor[to]}</span>
              )}
            </span>
            <span className="bnav__label">{label}</span>
          </NavLink>
        ))}
      </nav>
    </div>
  );
}
