import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  List, LocateFixed, Plus, Utensils, Soup, Fish, CookingPot, Pizza, UtensilsCrossed,
} from 'lucide-react';
import BottomNav from '../components/BottomNav.jsx';
import {
  useKakaoMap, useMyLocation, renderPins, renderMyLocation,
  attachLongPress, renderDraftPin, renderClusters, GEO, GEO_MESSAGE,
} from '../hooks/useKakaoMap.js';
import { useDebouncedValue } from '../hooks/useDebouncedValue.js';
import {
  getRestaurants, getSpots, createSpot, getSpot, getRestaurant,
} from '../api/endpoints.js';
import { proposeTo, matchingErrorMessage } from '../lib/matching.js';
import { shortCategory, FOOD_FILTERS, applyFoodFilter } from '../lib/foodCategory.js';
import { formatDistance } from '../lib/format.js';

const FILTER_ICONS = { Utensils, Soup, Fish, CookingPot, Pizza, UtensilsCrossed };

/**
 * 지도 페이지 — 카카오 지도 API 사용 지점 ①
 *  · 지도 렌더링/핀: 프론트 SDK (VITE_KAKAO_JS_KEY, index.html 스크립트)
 *  · 주변 음식점: 서버 /api/restaurants (내부에서 카카오 REST 프록시 + DB 캐시)
 *  · 내 마커:     서버 /api/spots      ("여기서 먹고싶어요" — 식당이 아닌 지점도 가능)
 *
 * 조작
 *  · 핀 탭        → 배너에서 바로 "밥 같이 할까요?" / "아니요"
 *  · 지도 길게 누르기 → 그 자리에 마커 만들기
 *  · ◎ 버튼       → 내 위치로
 */
export default function MapPage() {
  const nav = useNavigate();
  const { containerRef, map, ready, failed, getCenter, getRadius, panTo, setCenter } = useKakaoMap();
  const { pos, state: geoState, request: requestLocation } = useMyLocation();

  const [restaurants, setRestaurants] = useState([]);
  const [spots, setSpots] = useState([]);
  const [selected, setSelected] = useState(null);
  const [detail, setDetail] = useState(null);     // 선택한 핀의 상세(모집 중인 사람 목록)
  const [detailBusy, setDetailBusy] = useState(false);
  const [sending, setSending] = useState(false);
  const [keyword, setKeyword] = useState('');
  const [foodFilter, setFoodFilter] = useState('ALL');   // 지도 상단 음식 종류 필터
  const [zoomLevel, setZoomLevel] = useState(4);          // 클러스터 전환 판단용
  const [draft, setDraft] = useState(null);       // 롱프레스로 찍은 임시 지점
  const [draftLabel, setDraftLabel] = useState('');
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(false);

  const centeredOnce = useRef(false);
  const keywordRef = useRef(keyword);
  keywordRef.current = keyword;

  /* ── 조회 ─────────────────────────────────── */
  const load = useCallback(async () => {
    if (!map.current) return;
    const c = getCenter();
    const radius = getRadius();
    setLoading(true);
    try {
      // 마커는 검색어와 무관하게 늘 보여준다(내가 찍은 게 사라지면 혼란스러움)
      const [rs, sp] = await Promise.all([
        getRestaurants({ ...c, radius, keyword: keywordRef.current }).catch(() => []),
        getSpots({ ...c, radius }).catch(() => []),
      ]);
      setRestaurants(rs);
      setSpots(sp);
    } finally {
      setLoading(false);
    }
  }, [getCenter, getRadius, map]);

  useEffect(() => { if (ready) load(); }, [ready, load]);

  // 입력을 멈추면(300ms) 자동으로 검색 — 지도 앱처럼 타이핑 도중에 결과가 바뀐다
  const debouncedKeyword = useDebouncedValue(keyword, 300);
  useEffect(() => { if (ready) load(); }, [debouncedKeyword]); // eslint-disable-line react-hooks/exhaustive-deps

  /* ── 위치 확보되면 최초 1회 그쪽으로 이동 ───── */
  useEffect(() => {
    if (!ready || !pos || centeredOnce.current) return;
    centeredOnce.current = true;
    setCenter(pos.lat, pos.lng);
    load();
  }, [ready, pos, setCenter, load]);

  /* ── 핀을 고르면 상세(모집자 목록)를 받아온다 ── */
  useEffect(() => {
    if (!selected) { setDetail(null); return; }
    let alive = true;
    setDetail(null);
    setDetailBusy(true);
    const id = selected.kind === 'spot' ? selected.raw.spot_id : selected.raw.restaurant_id;
    (selected.kind === 'spot' ? getSpot(id) : getRestaurant(id))
      .then((d) => { if (alive) setDetail(d); })
      .catch(() => { if (alive) setDetail(null); })
      .finally(() => { if (alive) setDetailBusy(false); });
    return () => { alive = false; };
  }, [selected]);

  /* ── 오버레이 ─────────────────────────────── */
  // 필터는 식당에만 건다. 내가 찍은 마커는 음식 종류가 없으므로 항상 보여준다.
  const shownRestaurants = applyFoodFilter(restaurants, foodFilter);

  const pinItems = [
    ...spots.map((s) => ({
      key: `s${s.spot_id}`, kind: 'spot', raw: s, icon: '📍',
      lat: Number(s.latitude), lng: Number(s.longitude),
      label: s.label, count: s.recruiting_count, isPopular: !!s.is_popular,
    })),
    ...shownRestaurants.map((r) => ({
      key: `r${r.restaurant_id}`, kind: 'restaurant', raw: r,
      lat: Number(r.latitude), lng: Number(r.longitude),
      label: r.name, count: r.recruiting_count, isPopular: !!r.is_popular,
    })),
  ];

  /*
   * 축소 상태에서는 핀이 겹쳐 읽을 수 없으므로 클러스터(숫자 원)로 묶고,
   * 확대하면 개별 핀으로 돌아간다. 둘을 동시에 그리면 이중으로 보인다.
   */
  const clustered = zoomLevel >= 6;

  useEffect(() => {
    if (!ready || !map.current || clustered) return;
    return renderPins(map.current, pinItems, setSelected);
  }, [ready, spots, shownRestaurants, map, clustered]);

  useEffect(() => {
    if (!ready || !map.current || !clustered) return;
    return renderClusters(map.current, pinItems, { minLevel: 6 });
  }, [ready, spots, shownRestaurants, map, clustered]);

  // 줌이 바뀌면 클러스터/핀 전환을 판단해야 한다
  useEffect(() => {
    if (!ready || !map.current) return;
    const mp = map.current;
    const onZoom = () => setZoomLevel(mp.getLevel());
    setZoomLevel(mp.getLevel());
    window.kakao.maps.event.addListener(mp, 'zoom_changed', onZoom);
    return () => window.kakao.maps.event.removeListener(mp, 'zoom_changed', onZoom);
  }, [ready, map]);

  useEffect(() => {
    if (!ready || !map.current) return;
    return renderMyLocation(map.current, pos);
  }, [ready, pos, map]);

  useEffect(() => {
    if (!ready || !map.current) return;
    return renderDraftPin(map.current, draft);
  }, [ready, draft, map]);

  /* ── 지도 이동이 끝나면 그 영역 다시 조회 ───── */
  useEffect(() => {
    if (!ready || !map.current) return;
    const mp = map.current;
    const handler = () => load();
    window.kakao.maps.event.addListener(mp, 'dragend', handler);
    window.kakao.maps.event.addListener(mp, 'zoom_changed', handler);
    return () => {
      window.kakao.maps.event.removeListener(mp, 'dragend', handler);
      window.kakao.maps.event.removeListener(mp, 'zoom_changed', handler);
    };
  }, [ready, load, map]);

  /* ── 길게 눌러 마커 찍기 ───────────────────── */
  useEffect(() => {
    if (!ready || !map.current || !containerRef.current) return;
    return attachLongPress(map.current, containerRef.current, (at) => {
      setSelected(null);
      setDraftLabel('');
      setDraft(at);
    });
  }, [ready, map, containerRef]);

  const saveSpot = async () => {
    const label = draftLabel.trim();
    if (!label || !draft) return;
    setSaving(true);
    try {
      const spot = await createSpot({ label, lat: draft.lat, lng: draft.lng });
      setDraft(null);
      setSpots((prev) =>
        prev.some((s) => s.spot_id === spot.spot_id) ? prev : [...prev, spot]);
      // 마커만 만들면 아무도 못 만난다 → 바로 취향 선택으로 이어서 모집 시작
      nav(`/preference?spotId=${spot.spot_id}`);
    } catch (e) {
      alert(matchingErrorMessage(e, '마커를 만들지 못했어요.'));
      setSaving(false);
    }
  };

  const goMyLocation = () => {
    if (pos) { panTo(pos.lat, pos.lng); setTimeout(load, 400); }
    else requestLocation();
  };

  const isSpot = selected?.kind === 'spot';
  const placeId = isSpot ? selected?.raw.spot_id : selected?.raw.restaurant_id;
  const buddies = detail?.preview || [];

  /** "밥 같이 할까요?" — 1명이면 바로 요청, 여러 명이면 목록에서 고르게 */
  const askToEat = async () => {
    if (!buddies.length) return;
    if (buddies.length > 1) {
      nav(isSpot ? `/spots/${placeId}/buddies` : `/restaurants/${placeId}/buddies`);
      return;
    }
    setSending(true);
    try {
      const proposal = await proposeTo(buddies[0], {
        kind: selected.kind,
        placeId,
        foodTypeCode: isSpot ? 'ANY' : selected.raw.food_type_code,
      });
      nav(`/proposals/${proposal.id}/wait`);
    } catch (e) {
      alert(matchingErrorMessage(e, '매칭 요청을 보내지 못했어요.'));
      setSending(false);
    }
  };

  const geoNotice = GEO_MESSAGE[geoState];

  return (
    <div className="screen">
      <div className="map-wrap">
        <div ref={containerRef} className="map-canvas" />

        {/* 지도 SDK 가 안 올라온 경우 (JS 키 미설정 / 도메인 미등록) */}
        {failed && (
          <div className="map-blocked">
            <p><b>지도를 불러오지 못했어요.</b></p>
            <p className="muted" style={{ marginTop: 8 }}>
              카카오 JavaScript 키(<code>VITE_KAKAO_JS_KEY</code>)가 없거나,
              카카오 콘솔 &gt; 플랫폼 &gt; Web 에 지금 주소({location.origin})가 등록되지 않았습니다.
            </p>
          </div>
        )}

        <input className="map-search" placeholder="음식점 검색" value={keyword}
               onChange={(e) => setKeyword(e.target.value)}
               onKeyDown={(e) => e.key === 'Enter' && load()} />

        {/* 음식 종류 필터 — 식당 핀에만 적용된다 */}
        <div className="map-filters">
          {FOOD_FILTERS.map((f) => {
            const Icon = FILTER_ICONS[f.icon];
            return (
              <button key={f.value} type="button"
                      className={`map-filter${foodFilter === f.value ? ' is-on' : ''}`}
                      onClick={() => setFoodFilter(f.value)}>
                <Icon size={13} strokeWidth={2.2} />{f.label}
              </button>
            );
          })}
        </div>

        {/* 위치 권한 안내 — 조용히 실패하지 않도록 이유를 띄운다 */}
        {geoNotice && (
          <div className={`geo-notice geo-notice--${geoState}`}>
            <span>{geoNotice}</span>
            {(geoState === GEO.DENIED || geoState === GEO.UNAVAILABLE) && (
              <button className="geo-notice__btn" onClick={requestLocation}>다시 시도</button>
            )}
          </div>
        )}

        {loading && <div className="map-loading">불러오는 중…</div>}

        {!draft && !selected && (
          <div className="map-hint">지도를 길게 누르면 “여기서 먹고싶어요” 마커를 찍을 수 있어요</div>
        )}

        <button className="map-fab map-fab--list" onClick={() => nav('/restaurants')} aria-label="목록 보기">
          <List size={18} strokeWidth={2.2} />
        </button>
        <button className="map-fab map-fab--me" onClick={goMyLocation} aria-label="내 위치로">
          <LocateFixed size={20} strokeWidth={2.2} />
        </button>
        <button className="map-fab" onClick={() => nav('/recruit')} aria-label="밥친구 모집하기">
          <Plus size={22} strokeWidth={2.4} />
        </button>

        {/* 롱프레스 → 마커 만들기 시트 */}
        {draft && (
          <div className="sheet">
            <div className="sheet__handle" onClick={() => setDraft(null)} />
            <strong style={{ fontSize: 17 }}>여기서 먹고싶어요</strong>
            <p className="muted" style={{ marginTop: 4 }}>
              이 자리에 마커를 남기면 근처 사람들이 보고 밥친구를 신청할 수 있어요.
            </p>
            <input className="input" style={{ marginTop: 12 }} autoFocus maxLength={100}
                   placeholder="예) 학교 앞에서 점심 같이 드실 분"
                   value={draftLabel}
                   onChange={(e) => setDraftLabel(e.target.value)}
                   onKeyDown={(e) => e.key === 'Enter' && saveSpot()} />
            <div className="row" style={{ marginTop: 12 }}>
              <button className="btn btn--line" onClick={() => setDraft(null)}>취소</button>
              <button className="btn" disabled={!draftLabel.trim() || saving} onClick={saveSpot}>
                {saving ? '만드는 중…' : '마커 찍고 모집하기'}
              </button>
            </div>
          </div>
        )}

        {/* 핀 배너 — 모집 중인 사람이 있으면 여기서 바로 "밥 같이 할까요?" */}
        {selected && !draft && (
          <div className="sheet" onClick={(e) => e.stopPropagation()}>
            <div className="sheet__handle" onClick={() => setSelected(null)} />
            <div className="row" style={{ justifyContent: 'space-between' }}>
              <strong style={{ fontSize: 17 }}>{selected.label}</strong>
              {selected.isPopular ? <span className="tag tag--hot">인기</span> : null}
            </div>

            <p className="muted" style={{ marginTop: 4 }}>
              {isSpot
                ? (selected.raw.address || '지도에 찍힌 지점')
                : `${shortCategory(selected.raw) || selected.raw.food_type_label} · ${formatDistance(selected.raw.distance_m)}`}
            </p>

            {detailBusy && <p className="muted" style={{ marginTop: 12 }}>불러오는 중…</p>}

            {!detailBusy && buddies.length > 0 && (
              <>
                <div className="map-buddy-box">
                  <strong style={{ fontSize: 14 }}>
                    현재 {buddies.length}명이 여기서 밥친구를 찾고 있어요
                  </strong>
                  <div className="avatar-stack" style={{ marginTop: 12 }}>
                    {buddies.slice(0, 4).map((u) => (
                      <img key={u.user_id} className="avatar"
                           src={u.profile_image || '/avatar-default.png'} alt="" />
                    ))}
                  </div>
                </div>

                <p className="ask-title">밥 같이 할까요?</p>
                <div className="row" style={{ marginTop: 10 }}>
                  <button className="btn btn--line" onClick={() => setSelected(null)}>
                    아니요
                  </button>
                  <button className="btn btn--accent" disabled={sending} onClick={askToEat}>
                    {sending ? '보내는 중…'
                      : buddies.length > 1 ? '누구와 먹을까요?' : '네, 좋아요'}
                  </button>
                </div>
              </>
            )}

            {!detailBusy && buddies.length === 0 && (
              <>
                <p style={{ marginTop: 12, fontWeight: 600, fontSize: 14, color: 'var(--c-text-sub)' }}>
                  아직 아무도 없어요 — 먼저 모집해 보세요
                </p>
                <div className="row" style={{ marginTop: 12 }}>
                  <button className="btn btn--line" onClick={() => setSelected(null)}>닫기</button>
                  <button className="btn btn--accent"
                          onClick={() => nav(isSpot
                            ? `/preference?spotId=${placeId}`
                            : `/preference?restaurantId=${placeId}`)}>
                    여기서 모집 시작
                  </button>
                </div>
              </>
            )}
          </div>
        )}
      </div>
      <BottomNav />
    </div>
  );
}
