import { Link, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import BottomNav from '../components/BottomNav.jsx';
import { getHome } from '../api/endpoints.js';
import { useAuth } from '../context/AuthContext.jsx';

/** 홈 — 랜덤 매칭 진입 / 지도 매칭 진입 / 확정 매칭 정보 */
export default function HomePage() {
  const nav = useNavigate();
  const { user } = useAuth();
  const { data } = useQuery({ queryKey: ['home'], queryFn: getHome });
  const m = data?.confirmedMatch;

  return (
    <div className="screen">
      <header className="appbar">
        <h1 className="appbar__title">안녕하세요, {user?.nickname}님 👋</h1>
        <button className="icon-btn" onClick={() => nav('/mypage')} aria-label="마이페이지">👤</button>
      </header>

      <div className="screen__body">
        {m ? (
          <Link to={`/chats/${m.match_id}`} style={{ textDecoration: 'none', color: 'inherit' }}>
            <div className="card">
              <span className="tag">확정된 약속</span>
              <div className="list-item" style={{ marginTop: 12 }}>
                <img className="avatar" src={m.partner_image || '/avatar-default.png'} alt="" />
                <div className="list-item__body">
                  <strong>{m.partner_nickname}</strong>
                  <div className="muted">
                    {m.meal_time_label} · {m.restaurant_name || m.food_type_label}
                  </div>
                </div>
                <span>›</span>
              </div>
            </div>
          </Link>
        ) : (
          <div className="card" style={{ textAlign: 'center' }}>
            <p className="muted">아직 확정된 약속이 없어요.<br />오늘 한 끼 같이 할 사람을 찾아볼까요?</p>
          </div>
        )}

        <h2 className="section-title">밥친구 찾기</h2>
        <button className="btn" onClick={() => nav('/preference')}>🎲 랜덤 매칭 시작하기</button>
        <button className="btn btn--ghost" style={{ marginTop: 10 }} onClick={() => nav('/map')}>
          🗺️ 지도에서 찾기
        </button>
      </div>

      <BottomNav />
    </div>
  );
}
