import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Dices, MapPin, Sparkles, ChevronRight, UtensilsCrossed } from 'lucide-react';
import BottomNav from '../components/BottomNav.jsx';
import ConfirmDialog from '../components/ConfirmDialog.jsx';
import { useMyLocation, FALLBACK_CENTER } from '../hooks/useKakaoMap.js';
import { formatDistance } from '../lib/format.js';
import {
  getHome, getCurrentMatching, cancelMatching, getSentProposals, getRestaurants,
} from '../api/endpoints.js';
import { useAuth } from '../context/AuthContext.jsx';
import './HomePage.css';

// 한글 받침 유무에 따라 "이/가" 조사를 고른다 (한식 → 이, 기타 → 가)
function withEunGa(word, withBatchim, withoutBatchim) {
  const code = word.charCodeAt(word.length - 1) - 0xac00;
  if (code < 0 || code > 11171) return withoutBatchim;
  return code % 28 === 0 ? withoutBatchim : withBatchim;
}

// 시간대별 인사말 — 매번 같은 문구 대신 지금 시간에 맞는 한마디
function getGreeting() {
  const h = new Date().getHours();
  if (h >= 5 && h < 11)  return '든든한 아침으로 하루를 시작해봐요.';
  if (h >= 11 && h < 14) return '오늘 점심 메뉴는 정하셨나요?';
  if (h >= 14 && h < 18) return '출출한 오후, 간식 친구는 어때요?';
  if (h >= 18 && h < 22) return '오늘 저녁, 같이 먹을 친구를 찾아볼까요?';
  return '야식 친구 구하기 딱 좋은 시간이에요.';
}

/** 홈 — 지도 매칭 진입 / 랜덤 매칭 진입 / 확정 매칭 정보 / 진행 중 매칭 / 오늘의 추천 맛집 */
export default function HomePage() {
  const nav = useNavigate();
  const { user } = useAuth();
  const qc = useQueryClient();
  const [confirmCancel, setConfirmCancel] = useState(false);

  const { data } = useQuery({ queryKey: ['home'], queryFn: getHome });

  // 오늘의 추천 맛집 — 카카오 API는 평점을 안 주므로(항상 null) 별점 대신
  // 현재 위치에서 가까운 순으로 보여준다
  const { pos: myPos } = useMyLocation({ watch: false });
  const { data: nearby = [] } = useQuery({
    queryKey: ['home', 'nearby', myPos?.lat, myPos?.lng],
    queryFn: () => getRestaurants({ ...(myPos ?? FALLBACK_CENTER), radius: 2000 }),
  });
  const recommended = [...nearby]
    .sort((a, b) => a.distance_m - b.distance_m)
    .slice(0, 6);

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
            <p className="home__sub">{getGreeting()}</p>
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
        </section>

        {/* 지금 매칭 찾는 인원 / 이번 주 인기 음식 — 가벼운 사회적 증거, 데이터 없으면 안 보여준다 */}
        {(!!data?.searchingCount || data?.popularFood) && (
          <div className="home__stats-row">
            {!!data?.searchingCount && (
              <div className="home__stat-pill">
                <span className="dot-pulse" aria-hidden="true" />
                지금 {data.searchingCount}명이 밥친구를 찾고 있어요
              </div>
            )}
            {data?.popularFood && (
              <div className="home__stat-pill">
                이번 주는 {data.popularFood.label}{withEunGa(data.popularFood.label, '이', '가')} 인기예요 ({data.popularFood.pct}%)
              </div>
            )}
          </div>
        )}

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

        {/* 오늘의 추천 맛집 — 주변 음식점 중 평점 높은 순 */}
        {recommended.length > 0 && (
          <>
            <h2 className="home__section-title">오늘의 추천 맛집</h2>
            <div className="home__reco-row">
              {recommended.map((r) => (
                <button type="button" key={r.restaurant_id} className="home__reco-card"
                        onClick={() => nav(`/restaurants/${r.restaurant_id}/buddies`)}>
                  <span className="home__reco-thumb"><UtensilsCrossed size={22} strokeWidth={1.8} /></span>
                  <span className="home__reco-body">
                    <span className="home__reco-name">{r.name}</span>
                    <span className="home__reco-meta">{formatDistance(r.distance_m)}</span>
                  </span>
                </button>
              ))}
            </div>
          </>
        )}
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
