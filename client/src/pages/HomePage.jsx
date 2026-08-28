import { Link, useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import BottomNav from '../components/BottomNav.jsx';
import {
  getHome, getAssistantStarters, getCurrentMatching, cancelMatching,
} from '../api/endpoints.js';
import { useAuth } from '../context/AuthContext.jsx';

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
                    {m.meal_time} · {m.restaurant_name || m.food_type}
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

        {/* 진행 중인 매칭 — 이어보기 / 취소 */}
        {searching && (
          <div className="card matching-card" style={{ marginTop: 12 }}>
            <div className="row" style={{ justifyContent: 'space-between' }}>
              <span className="tag">매칭 진행 중</span>
              <span className="dot-pulse" aria-hidden="true" />
            </div>
            <p style={{ marginTop: 10, fontWeight: 700 }}>
              {current.food_type} · {current.meal_time} 밥친구를 찾고 있어요
            </p>
            <p className="muted" style={{ marginTop: 4 }}>
              취소하기 전에는 새로운 매칭을 시작할 수 없어요.
            </p>
            <div className="row" style={{ marginTop: 12 }}>
              <button className="btn btn--line" onClick={cancel}>매칭 취소</button>
              <button className="btn" onClick={() => nav(`/matching/${current.id}`)}>이어보기</button>
            </div>
          </div>
        )}

        <h2 className="section-title">밥친구 찾기</h2>
        <button className="btn" disabled={searching} onClick={() => nav('/preference')}>
          🎲 랜덤 매칭 시작하기
        </button>
        <button className="btn btn--ghost" style={{ marginTop: 10 }} onClick={() => nav('/map')}>
          🗺️ 지도에서 찾기
        </button>
        {searching && (
          <p className="muted" style={{ marginTop: 8, textAlign: 'center' }}>
            진행 중인 매칭을 취소하면 다시 시작할 수 있어요.
          </p>
        )}

        {/* AI 도우미 — 질문을 누르면 그 질문으로 바로 대화가 시작된다 */}
        <h2 className="section-title">AI 도우미</h2>
        <div className="card ai-card" onClick={() => nav('/assistant')}>
          <div className="row">
            <div className="ai-card__icon">🍚</div>
            <div className="list-item__body">
              <strong>무엇이든 물어보세요</strong>
              <div className="muted">오늘 뭐 먹지? 앱은 어떻게 써요?</div>
            </div>
            <span>›</span>
          </div>

          <div className="ai-starters" onClick={(e) => e.stopPropagation()}>
            {starters.map((s) => (
              <button key={s} className="ai-starter"
                      onClick={() => nav(`/assistant?q=${encodeURIComponent(s)}`)}>
                {s}
              </button>
            ))}
          </div>
        </div>
      </div>

      <BottomNav />
    </div>
  );
}
