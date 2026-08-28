import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Dices, MapPin, Sparkles, ChevronRight, UtensilsCrossed, Shuffle } from 'lucide-react';
import BottomNav from '../components/BottomNav.jsx';
import ConfirmDialog from '../components/ConfirmDialog.jsx';
import { useMyLocation, FALLBACK_CENTER } from '../hooks/useKakaoMap.js';
import { formatDistance } from '../lib/format.js';
import { SCALE_STEPS, loadA11y, saveA11y, applyA11y } from '../lib/a11y.js';
import {
  getHome, getCurrentMatching, cancelMatching, getSentProposals, getRestaurants, startBlindMatching,
} from '../api/endpoints.js';
import { useAuth } from '../context/AuthContext.jsx';
import logo from '../assets/logo.png';
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

  // 화면 크게 보기 — 발표할 때 잘 안 보일 수 있어서 넣는 접근성 위젯.
  // 계정별로 저장해서 다른 페이지로 이동해도(앱 전역 zoom) 계속 유지된다.
  const [a11yPrefs, setA11yPrefs] = useState(() => loadA11y(user?.id));
  const updateA11y = (patch) => {
    const next = { ...a11yPrefs, ...patch };
    setA11yPrefs(next);
    saveA11y(user?.id, next);
    applyA11y(next);
  };

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
    refetchInterval: 5000, // 진짜 랜덤 매칭은 다른 사람이 붙는 순간을 홈에서도 바로 알아채야 한다
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
  const isBlindSearching = current?.matching_type === 'BLIND' && current.status === 'SEARCHING';

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

  // 진짜 랜덤 매칭 — 조건 없이 눌러서 같은 모드로 기다리는 사람과 즉시 이어진다.
  // 대기 중에도 홈을 벗어날 수 있어야 해서(전용 대기 화면으로 가두지 않음) 버튼 자리에서
  // 바로 카운트다운 + 취소로 바뀐다. 남은 시간은 서버의 started_at 기준으로 매초 다시 계산한다.
  const [blindBusy, setBlindBusy] = useState(false);
  const [blindCancelling, setBlindCancelling] = useState(false);
  const [, forceTick] = useState(0);

  useEffect(() => {
    if (!isBlindSearching) return;
    const timer = setInterval(() => forceTick((n) => n + 1), 1000);
    return () => clearInterval(timer);
  }, [isBlindSearching]);

  const blindSecondsLeft = isBlindSearching
    ? Math.max(0, 30 * 60 - Math.floor((Date.now() - new Date(current.started_at).getTime()) / 1000))
    : 0;
  const blindMmss = `${String(Math.floor(blindSecondsLeft / 60)).padStart(2, '0')}:${String(blindSecondsLeft % 60).padStart(2, '0')}`;

  useEffect(() => {
    if (isBlindSearching && blindSecondsLeft === 0) {
      cancelMatching(current.id).finally(() => {
        qc.invalidateQueries({ queryKey: ['matching', 'current'] });
      });
    }
  }, [isBlindSearching, blindSecondsLeft, current?.id, qc]);

  const startBlind = async () => {
    setBlindBusy(true);
    try {
      const res = await startBlindMatching();
      if (res.matched) nav(`/chats/${res.matchId}`);
      else qc.invalidateQueries({ queryKey: ['matching', 'current'] });
    } catch (e) {
      alert(e.response?.data?.message || '진짜 랜덤 매칭을 시작하지 못했어요.');
    } finally {
      setBlindBusy(false);
    }
  };

  const cancelBlind = async () => {
    if (!current) return;
    setBlindCancelling(true);
    try {
      await cancelMatching(current.id);
      qc.invalidateQueries({ queryKey: ['matching', 'current'] });
    } catch (e) {
      alert(e.response?.data?.message || '취소하지 못했어요.');
    } finally {
      setBlindCancelling(false);
    }
  };

  return (
    <div className="screen">
      <div className="screen__body home__body">
        <img className="home__logo" src={logo} alt="DO밥" />
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

        {/* 지금 매칭 찾는 인원 / 이번 주 인기 음식 — 알약 두 개가 동시에 뜨면 부담스러워서
            한 줄에 하나만, 있는 것 위주로(둘 다 있으면 실시간 인원 쪽을 우선한다) */}
        {(!!data?.searchingCount || data?.popularFood) && (
          <div className="home__stat-pill">
            {!!data?.searchingCount ? (
              <>
                <span className="dot-pulse" aria-hidden="true" />
                지금 {data.searchingCount}명이 밥친구를 찾고 있어요
              </>
            ) : (
              <>
                이번 주는 {data.popularFood.label}{withEunGa(data.popularFood.label, '이', '가')} 인기예요 ({data.popularFood.pct}%)
              </>
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

        {/* 진행 중인 매칭 — 이어보기 / 취소 (취소 전엔 새 매칭을 시작할 수 없다). 진짜 랜덤
            매칭은 아래 버튼 자리에서 카운트다운으로 따로 보여주므로 여기선 제외한다. */}
        {searching && !isBlindSearching && (
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

        {/* 진짜 랜덤 매칭 — 취향 조건 없이 눌러서 30분 안에 무작위로 바로 이어진다.
            대기 중엔 홈을 나가도 되게(전용 화면으로 안 가두고) 버튼 자리에서 카운트다운으로 보여준다. */}
        {isBlindSearching ? (
          <div className="home__blind-row">
            <div className="home__blind-btn home__blind-btn--waiting">
              <span className="home__blind-icon"><Shuffle size={16} strokeWidth={2.2} /></span>
              <span className="home__blind-text">
                <strong>진짜 랜덤 매칭 찾는 중… {blindMmss}</strong>
                <span>다른 분이 누르면 바로 이어져요</span>
              </span>
            </div>
            <button type="button" className="home__blind-cancel" disabled={blindCancelling} onClick={cancelBlind}>
              취소
            </button>
          </div>
        ) : (
          <button type="button" className="home__blind-btn" disabled={blindBusy || searching || !!pendingSent}
                  onClick={startBlind}>
            <span className="home__blind-icon"><Shuffle size={16} strokeWidth={2.2} /></span>
            <span className="home__blind-text">
              <strong>진짜 랜덤 매칭</strong>
              <span>조건 없이, 30분 안에 무작위로 바로 이어져요</span>
            </span>
          </button>
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

        {/* 화면 크게 보기 — 발표용. 여기서 바꾸면 다른 화면으로 이동해도 계속 적용된다. */}
        <div className="home__a11y">
          <p className="home__a11y-title">화면 크게 보기</p>
          <div className="home__a11y-row">
            {SCALE_STEPS.map((s) => (
              <button key={s.value} type="button"
                      className={`home__a11y-btn${a11yPrefs.scale === s.value ? ' home__a11y-btn--active' : ''}`}
                      onClick={() => updateA11y({ scale: s.value })}>
                {s.label}
              </button>
            ))}
          </div>
          <label className="home__a11y-bold-row">
            <span>굵은 글씨</span>
            <input type="checkbox" checked={a11yPrefs.bold} onChange={(e) => updateA11y({ bold: e.target.checked })} />
          </label>
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
