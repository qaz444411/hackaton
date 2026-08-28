import { Link, useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { User, Dices, MapPin, Sparkles } from 'lucide-react';
import BottomNav from '../components/BottomNav.jsx';
import {
  getHome, getAssistantStarters, getCurrentMatching, cancelMatching,
} from '../api/endpoints.js';
import { useAuth } from '../context/AuthContext.jsx';
import './HomePage.css';

/** 홈 — 랜덤 매칭 진입 / 지도 매칭 진입 / 확정 매칭 정보 / 진행 중 매칭 / AI 도우미 */
export default function HomePage() {
  const nav = useNavigate();
  const { user } = useAuth();
  const qc = useQueryClient();

  const { data } = useQuery({ queryKey: ['home'], queryFn: getHome });
  const { data: startersData } = useQuery({
    queryKey: ['assistant', 'starters'], queryFn: getAssistantStarters,
  });

  // 진행 중인 매칭.
  // 매칭 화면에서 뒤로가기로 빠져나와도 여기서 다시 찾아가거나 취소할 수 있어야 한다.
  // 활성 요청은 사용자당 1건만 허용되므로(uq_matching_request_active),
  // 이걸 취소하지 않으면 새 매칭을 시작할 때 409 로 막힌다.
  const { data: current } = useQuery({
    queryKey: ['matching', 'current'],
    queryFn: getCurrentMatching,
    refetchOnWindowFocus: true,
  });

  const m = data?.confirmedMatch;
  const starters = startersData?.starters || [];
  const searching = current && current.status === 'SEARCHING';

  const cancel = async () => {
    if (!current) return;
    if (!window.confirm('진행 중인 매칭을 취소할까요?')) return;
    try {
      await cancelMatching(current.id);
    } catch (e) {
      alert(e.response?.data?.message || '취소하지 못했어요.');
    } finally {
      qc.invalidateQueries({ queryKey: ['matching', 'current'] });
      qc.invalidateQueries({ queryKey: ['home'] });
    }
  };

  return (
    <div className="screen">
      <div className="screen__body">
        <div className="home">
          <header className="home__header">
            <div className="home__logo">
              <span className="home__logo-emoji">🍱</span>
            </div>
            <div className="home__brand">
              <p className="home__brand-title">안녕하세요, {user?.nickname}님</p>
              <p className="home__brand-sub">혼밥은 이제 그만! 🙌</p>
            </div>
            <button className="icon-btn home__mypage-btn" onClick={() => nav('/mypage')} aria-label="마이페이지">
              <User size={20} strokeWidth={2} />
            </button>
          </header>

          {m ? (
            <Link to={`/chats/${m.match_id}`} style={{ textDecoration: 'none', color: 'inherit', alignSelf: 'stretch' }}>
              <div className="card home__intro-card">
                <span className="tag">확정된 약속</span>
                <div className="list-item" style={{ marginTop: 12 }}>
                  <img className="avatar" src={m.partner_image || '/avatar-default.png'} alt="" />
                  <div className="list-item__body">
                    <strong>{m.partner_nickname}</strong>
                    <div className="muted">
                      {m.meal_time} · {m.restaurant_name || m.food_type}
                    </div>
                  </div>
                  <span>›</span>
                </div>
              </div>
            </Link>
          ) : (
            <div className="card home__intro-card">
              <p className="home__intro-title">오늘 어떻게 밥친구를 찾을까요?</p>
              <p className="home__intro-desc">두 가지 방법으로 취향에 맞는 밥친구를 만나보세요.</p>
            </div>
          )}

          {/* 진행 중인 매칭 — 이어보기 / 취소 (취소 전엔 새 매칭을 시작할 수 없다) */}
          {searching && (
            <div className="card matching-card home__searching-card">
              <div className="row" style={{ justifyContent: 'space-between' }}>
                <span className="tag">매칭 진행 중</span>
                <span className="dot-pulse" aria-hidden="true" />
              </div>
              <p className="home__searching-desc">
                {current.food_type} · {current.meal_time} 밥친구를 찾고 있어요
              </p>
              <p className="muted" style={{ marginTop: 4 }}>
                취소하기 전에는 새로운 매칭을 시작할 수 없어요.
              </p>
              <div className="row" style={{ marginTop: 12 }}>
                <button type="button" className="btn btn--line" onClick={cancel}>매칭 취소</button>
                <button type="button" className="btn" onClick={() => nav(`/matching/${current.id}`)}>이어보기</button>
              </div>
            </div>
          )}

          <section className="home__actions">
            <button type="button" className="home__action home__action--primary" disabled={searching}
                    onClick={() => nav('/preference')}>
              <span className="home__action-icon"><Dices size={24} strokeWidth={2} /></span>
              <span className="home__action-body">
                <span className="home__action-title">취향으로 랜덤 매칭</span>
                <span className="home__action-desc">취향 선택 → 매칭 → 상대 발견 → 채팅</span>
              </span>
              <span className="home__action-arrow">›</span>
            </button>

            <button type="button" className="home__action home__action--outline" onClick={() => nav('/map')}>
              <span className="home__action-icon"><MapPin size={24} strokeWidth={2} /></span>
              <span className="home__action-body">
                <span className="home__action-title">지도에서 밥친구 찾기</span>
                <span className="home__action-desc">지도 → 음식점/마커 선택 → 밥친구 확인 → 채팅</span>
              </span>
              <span className="home__action-arrow">›</span>
            </button>
            {searching && (
              <p className="muted" style={{ textAlign: 'center' }}>
                진행 중인 매칭을 취소하면 다시 시작할 수 있어요.
              </p>
            )}
          </section>

          {/* AI 도우미 — 질문을 누르면 그 질문으로 바로 대화가 시작된다 */}
          <h2 className="home__section-title">AI 도우미</h2>
          <div className="card home__ai-card" onClick={() => nav('/assistant')}>
            <div className="home__ai-row">
              <div className="home__ai-icon"><Sparkles size={20} strokeWidth={2} /></div>
              <div className="home__ai-body">
                <div className="home__ai-title">무엇이든 물어보세요</div>
                <div className="home__ai-desc">오늘 뭐 먹지? 앱은 어떻게 써요?</div>
              </div>
              <span className="home__ai-arrow">›</span>
            </div>

            <div className="home__ai-starters" onClick={(e) => e.stopPropagation()}>
              {starters.map((s) => (
                <button key={s} className="home__ai-starter"
                        onClick={() => nav(`/assistant?q=${encodeURIComponent(s)}`)}>
                  {s}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      <BottomNav />
    </div>
  );
}
