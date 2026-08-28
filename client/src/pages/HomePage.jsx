import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Dices, MapPin, Sparkles, ChevronRight } from 'lucide-react';
import BottomNav from '../components/BottomNav.jsx';
import ConfirmDialog from '../components/ConfirmDialog.jsx';
import {
  getHome, getAssistantStarters, getCurrentMatching, cancelMatching, getSentProposals,
} from '../api/endpoints.js';
import { useAuth } from '../context/AuthContext.jsx';
import './HomePage.css';

/** 홈 — 랜덤 매칭 진입 / 지도 매칭 진입 / 확정 매칭 정보 / 진행 중 매칭 / AI 도우미 */
export default function HomePage() {
  const nav = useNavigate();
  const { user } = useAuth();
  const qc = useQueryClient();
  const [confirmCancel, setConfirmCancel] = useState(false);

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

  // 내가 보낸 대기 중인 요청 — 화면(대기 페이지)을 나갔다 와도 여기서 다시 열 수 있어야 한다.
  const { data: sentProposals } = useQuery({
    queryKey: ['proposals', 'sent'],
    queryFn: getSentProposals,
    refetchInterval: 15000,
  });

  const m = data?.confirmedMatch;
  const starters = startersData?.starters || [];
  const pendingSent = sentProposals?.[0];
  // 직접 요청(지도/밥친구목록)은 매칭 요청과 제안이 함께 생기므로, 보낸 요청 카드가 있으면
  // 아래 "진행 중 매칭" 카드는 같은 상태를 중복해서 보여주는 셈이라 숨긴다.
  const searching = current && current.status === 'SEARCHING' && !pendingSent;

  const doCancel = async () => {
    if (!current) return;
    try {
      await cancelMatching(current.id);
    } catch (e) {
      alert(e.response?.data?.message || '취소하지 못했어요.');
    } finally {
      setConfirmCancel(false);
      qc.invalidateQueries({ queryKey: ['matching', 'current'] });
      qc.invalidateQueries({ queryKey: ['home'] });
    }
  };

  return (
    <div className="screen">
      <div className="screen__body home__body">
        <header className="home__header">
          <div className="home__greet">
            <p className="home__title">안녕하세요, {user?.nickname}님</p>
            <p className="home__sub">오늘도 맛있는 한 끼 함께해요.</p>
          </div>
          <button type="button" className="home__avatar" onClick={() => nav('/mypage')} aria-label="마이페이지">
            <img src={user?.profile_image || '/avatar-default.png'} alt="" />
          </button>
        </header>

        {m && (
          <Link to={`/chats/${m.match_id}`} className="home__match-card">
            <img className="home__match-avatar" src={m.partner_image || '/avatar-default.png'} alt="" />
            <div className="home__match-body">
              <div className="home__match-row">
                <strong className="home__match-name">{m.partner_nickname}</strong>
                <span className="home__match-tag">{m.meal_time}</span>
              </div>
              <p className="home__match-info">{m.restaurant_name || m.food_type}</p>
            </div>
            <ChevronRight size={20} strokeWidth={2} className="home__match-arrow" />
          </Link>
        )}

        {/* 확정된 매칭이 있어도 다른 밥친구를 계속 찾을 수 있어야 하므로 항상 보여준다 */}
        <section className="home__cards">
          <button type="button" className="home__card home__card--primary" disabled={searching || !!pendingSent}
                  onClick={() => nav('/preference')}>
            <span className="home__card-badge">
              <Dices size={13} strokeWidth={2.4} />
            </span>
            <span className="home__card-text">
              <span className="home__card-eyebrow">취향으로</span>
              <span className="home__card-title">랜덤 매칭</span>
            </span>
            <span className="home__card-illust home__card-illust--table" aria-hidden="true">
              <span className="home__card-illust-cup" />
            </span>
          </button>

          <button type="button" className="home__card home__card--outline" onClick={() => nav('/map')}>
            <span className="home__card-badge home__card-badge--accent">
              <MapPin size={13} strokeWidth={2.4} />
            </span>
            <span className="home__card-text">
              <span className="home__card-eyebrow home__card-eyebrow--dark">음식점에서</span>
              <span className="home__card-title home__card-title--dark">밥친구 찾기</span>
            </span>
            <span className="home__card-illust home__card-illust--map" aria-hidden="true">
              <span className="home__card-illust-pin" />
            </span>
          </button>
        </section>

        {/* 내가 보낸 요청 — 화면을 나가도 여기서 다시 확인/취소할 수 있다 */}
        {pendingSent && (
          <Link to={`/proposals/${pendingSent.id}/wait`} className="home__status-card">
            <div className="home__status-row">
              <span className="tag">요청 보냄</span>
              <span className="dot-pulse" aria-hidden="true" />
            </div>
            <div className="home__status-body">
              <p className="home__status-desc">
                {pendingSent.partner_nickname}님에게 보낸 요청, 답변을 기다리고 있어요
              </p>
              <p className="home__status-hint">눌러서 남은 시간과 상태를 확인하세요.</p>
            </div>
          </Link>
        )}

        {/* 진행 중인 매칭 — 이어보기 / 취소 (취소 전엔 새 매칭을 시작할 수 없다) */}
        {searching && (
          <div className="home__status-card">
            <div className="home__status-row">
              <span className="tag">매칭 진행 중</span>
              <span className="dot-pulse" aria-hidden="true" />
            </div>
            <div className="home__status-body">
              <p className="home__status-desc">
                {current.food_type} · {current.meal_time} 밥친구를 찾고 있어요
              </p>
              <p className="home__status-hint">취소하기 전에는 새로운 매칭을 시작할 수 없어요.</p>
            </div>

            <div className="home__status-actions">
              <button type="button" className="home__status-btn" onClick={() => setConfirmCancel(true)}>매칭 취소</button>
              <button type="button" className="home__status-btn home__status-btn--fill"
                      onClick={() => nav(`/matching/${current.id}`)}>이어보기</button>
            </div>
          </div>
        )}

        {!m && (searching || pendingSent) && (
          <p className="home__note">진행 중인 매칭을 취소하면 다시 시작할 수 있어요.</p>
        )}

        {/* AI 도우미 — 질문을 누르면 그 질문으로 바로 대화가 시작된다 */}
        <h2 className="home__section-title">AI 도우미</h2>
        <div className="home__ai-card" onClick={() => nav('/assistant')}>
          <div className="home__ai-row">
            <div className="home__ai-icon"><Sparkles size={17} strokeWidth={2} /></div>
            <div className="home__ai-body">
              <div className="home__ai-title">무엇이든 물어보세요</div>
              <div className="home__ai-desc">오늘 뭐 먹지? 앱은 어떻게 써요?</div>
            </div>
            <ChevronRight size={18} strokeWidth={2} className="home__ai-arrow" />
          </div>

          {starters.length > 0 && (
            <div className="home__ai-starters" onClick={(e) => e.stopPropagation()}>
              {starters.map((s) => (
                <button key={s} type="button" className="home__ai-starter"
                        onClick={() => nav(`/assistant?q=${encodeURIComponent(s)}`)}>
                  {s}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {confirmCancel && (
        <ConfirmDialog
          title="이 매칭을 취소할까요?"
          desc="지금 찾고 있는 밥친구 매칭을 취소할 수 있어요."
          confirmLabel="매칭 취소"
          cancelLabel="돌아가기"
          onCancel={() => setConfirmCancel(false)}
          onConfirm={doCancel}
        />
      )}

      <button type="button" className="home__ai-fab" onClick={() => nav('/assistant')} aria-label="AI 도우미">
        <Sparkles size={22} strokeWidth={2} />
      </button>

      <BottomNav />
    </div>
  );
}
