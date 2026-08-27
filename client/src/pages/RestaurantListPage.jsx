import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import AppBar from '../components/AppBar.jsx';
import BottomNav from '../components/BottomNav.jsx';
import { getRestaurants } from '../api/endpoints.js';

/** 음식점 목록 페이지 — 지도 ↔ 리스트 전환 */
export default function RestaurantListPage() {
  const nav = useNavigate();
  const [list, setList] = useState([]);
  const [keyword, setKeyword] = useState('');
  const [pos, setPos] = useState({ lat: 35.9675, lng: 126.7370 });

  useEffect(() => {
    navigator.geolocation?.getCurrentPosition(
      (p) => setPos({ lat: p.coords.latitude, lng: p.coords.longitude }), () => {});
  }, []);

  useEffect(() => {
    getRestaurants({ ...pos, radius: 2000, keyword }).then(setList);
  }, [pos]);

  return (
    <div className="screen">
      <AppBar title="주변 음식점"
              right={<button className="icon-btn" onClick={() => nav('/map')}>🗺️</button>} />
      <div className="screen__body">
        <input className="input" placeholder="음식점 검색" value={keyword}
               onChange={(e) => setKeyword(e.target.value)}
               onKeyDown={(e) => e.key === 'Enter' &&
                 getRestaurants({ ...pos, radius: 2000, keyword }).then(setList)} />

        <div className="list" style={{ marginTop: 14 }}>
          {list.map((r) => (
            <div key={r.restaurant_id} className="card"
                 onClick={() => nav(`/restaurants/${r.restaurant_id}/buddies`)}>
              <div className="row" style={{ justifyContent: 'space-between' }}>
                <strong className="ellipsis">{r.name}</strong>
                {r.is_popular ? <span className="tag">🔥 인기</span> : null}
              </div>
              <p className="muted" style={{ marginTop: 4 }}>
                {r.food_type_label} · {r.distance_m}m · ⭐ {r.rating ?? '-'}
              </p>
              <p style={{ marginTop: 8, color: 'var(--c-primary)', fontWeight: 700 }}>
                밥친구 {r.recruiting_count}명 모집 중
              </p>
            </div>
          ))}
          {!list.length && <p className="muted">주변에 표시할 음식점이 없습니다.</p>}
        </div>
      </div>
      <BottomNav />
    </div>
  );
}
