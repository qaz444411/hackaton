import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import BottomNav from '../components/BottomNav.jsx';
import { useKakaoMap, renderPins } from '../hooks/useKakaoMap.js';
import { getRestaurants } from '../api/endpoints.js';

/**
 * 지도 페이지 — 카카오 지도 API 사용 지점 ①
 *  · 지도 렌더링/핀: 프론트 SDK (VITE_KAKAO_JS_KEY, index.html 스크립트)
 *  · 주변 음식점 + 모집 인원: 서버 /api/restaurants (내부에서 카카오 REST 프록시)
 */
export default function MapPage() {
  const nav = useNavigate();
  const { containerRef, map, ready, getCenter } = useKakaoMap();
  const [list, setList] = useState([]);
  const [selected, setSelected] = useState(null);
  const [keyword, setKeyword] = useState('');

  const load = async () => {
    const c = getCenter();
    setList(await getRestaurants({ ...c, radius: 1500, keyword }));
  };

  useEffect(() => { if (ready) load(); }, [ready]);

  // 핀 렌더 (모집 인원 / 인기 배지)
  useEffect(() => {
    if (!ready || !map.current) return;
    return renderPins(map.current, list, setSelected);
  }, [ready, list]);

  // 지도 이동이 끝나면 해당 영역 다시 조회
  useEffect(() => {
    if (!ready || !map.current) return;
    const handler = () => load();
    window.kakao.maps.event.addListener(map.current, 'dragend', handler);
    return () => window.kakao.maps.event.removeListener(map.current, 'dragend', handler);
  }, [ready, keyword]);

  return (
    <div className="screen">
      <div className="map-wrap">
        <div ref={containerRef} className="map-canvas" />

        <input className="map-search" placeholder="음식점 검색" value={keyword}
               onChange={(e) => setKeyword(e.target.value)}
               onKeyDown={(e) => e.key === 'Enter' && load()} />

        {/* 리스트로 보기 / 원하는 식당 추가(+) */}
        <button className="map-fab map-fab--list" onClick={() => nav('/restaurants')}>☰</button>
        <button className="map-fab" onClick={() => nav('/recruit')}>+</button>

        {/* 음식점 배너 */}
        {selected && (
          <div className="sheet" onClick={(e) => e.stopPropagation()}>
            <div className="sheet__handle" onClick={() => setSelected(null)} />
            <div className="row" style={{ justifyContent: 'space-between' }}>
              <strong style={{ fontSize: 17 }}>{selected.name}</strong>
              {selected.is_popular ? <span className="tag">🔥 인기</span> : null}
            </div>
            <p className="muted" style={{ marginTop: 4 }}>
              ⭐ {selected.rating ?? '-'} · {selected.food_type_label} · {selected.distance_m}m
            </p>
            <p style={{ marginTop: 10, fontWeight: 700, color: 'var(--c-primary)' }}>
              지금 {selected.recruiting_count}명이 밥친구를 찾고 있어요
            </p>
            <div className="row" style={{ marginTop: 10 }}>
              {(selected.preview || []).map((u) => (
                <img key={u.user_id} className="avatar" style={{ width: 36, height: 36 }}
                     src={u.profile_image || '/avatar-default.png'} alt="" />
              ))}
            </div>
            <button className="btn" style={{ marginTop: 14 }}
                    onClick={() => nav(`/restaurants/${selected.restaurant_id}/buddies`)}>
              이 음식점 밥친구 보기
            </button>
          </div>
        )}
      </div>
      <BottomNav />
    </div>
  );
}
