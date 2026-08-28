import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Map, Search, UtensilsCrossed } from 'lucide-react';
import AppBar from '../components/AppBar.jsx';
import BottomNav from '../components/BottomNav.jsx';
import { useMyLocation, FALLBACK_CENTER, GEO_MESSAGE } from '../hooks/useKakaoMap.js';
import { getRestaurants } from '../api/endpoints.js';
import './RestaurantListPage.css';

/** 음식점 목록 페이지 — 지도 ↔ 리스트 전환 */
export default function RestaurantListPage() {
  const nav = useNavigate();
  const [list, setList] = useState([]);
  const [keyword, setKeyword] = useState('');
  const { pos: myPos, state: geoState } = useMyLocation({ watch: false });

  // 위치를 못 받으면 기본 좌표로라도 목록을 채운다
  const pos = myPos ?? FALLBACK_CENTER;

  useEffect(() => {
    getRestaurants({ lat: pos.lat, lng: pos.lng, radius: 2000, keyword }).then(setList);
  }, [pos.lat, pos.lng]);

  return (
    <div className="screen">
      <AppBar title="주변 음식점"
              right={<button className="icon-btn" onClick={() => nav('/map')}><Map size={18} /></button>} />
      <div className="screen__body">
        <label className="rl__search">
          <Search size={15} strokeWidth={2.2} />
          <input placeholder="음식점 검색" value={keyword}
                 onChange={(e) => setKeyword(e.target.value)}
                 onKeyDown={(e) => e.key === 'Enter' &&
                   getRestaurants({ lat: pos.lat, lng: pos.lng, radius: 2000, keyword }).then(setList)} />
        </label>

        {!myPos && GEO_MESSAGE[geoState] && (
          <p className="muted" style={{ marginTop: 8 }}>{GEO_MESSAGE[geoState]}</p>
        )}

        <div className="rl__list">
          {list.map((r) => (
            <button type="button" key={r.restaurant_id} className="rl__card"
                    onClick={() => nav(`/restaurants/${r.restaurant_id}/buddies`)}>
              <span className="rl__card-emoji"><UtensilsCrossed size={22} strokeWidth={2} /></span>
              <div className="rl__card-body">
                <div className="rl__card-name-row">
                  <span className="rl__card-name ellipsis">{r.name}</span>
                  {r.is_popular && <span className="rl__card-hot">🔥 인기</span>}
                </div>
                <p className="rl__card-sub">{r.food_type_label} · {r.distance_m}m · ⭐ {r.rating ?? '-'}</p>
                <p className="rl__card-recruit">밥친구 {r.recruiting_count}명 모집 중</p>
              </div>
            </button>
          ))}
          {!list.length && <p className="rl__empty">주변에 표시할 음식점이 없습니다.</p>}
        </div>
      </div>
      <BottomNav />
    </div>
  );
}
