import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Map, Search, UtensilsCrossed } from 'lucide-react';
import BottomNav from '../components/BottomNav.jsx';
import { useMyLocation, FALLBACK_CENTER, GEO_MESSAGE } from '../hooks/useKakaoMap.js';
import { useDebouncedValue } from '../hooks/useDebouncedValue.js';
import { getRestaurants } from '../api/endpoints.js';
import { formatDistance } from '../lib/format.js';
import './RestaurantListPage.css';

/** 음식점 목록 페이지 — 지도 ↔ 리스트 전환 */
export default function RestaurantListPage() {
  const nav = useNavigate();
  const [list, setList] = useState([]);
  const [keyword, setKeyword] = useState('');
  const debouncedKeyword = useDebouncedValue(keyword, 300);
  const { pos: myPos, state: geoState } = useMyLocation({ watch: false });

  // 위치를 못 받으면 기본 좌표로라도 목록을 채운다
  const pos = myPos ?? FALLBACK_CENTER;

  // 입력을 멈추면(300ms) 자동으로 검색 — 지도 앱처럼 "신전" → "신전떡볶이" 바로 뜨게
  useEffect(() => {
    getRestaurants({ lat: pos.lat, lng: pos.lng, radius: 2000, keyword: debouncedKeyword }).then(setList);
  }, [pos.lat, pos.lng, debouncedKeyword]);

  return (
    <div className="screen">
      <div className="screen__body rl__body">
        <header className="rl__header">
          <div>
            <button type="button" className="rl__back" onClick={() => nav(-1)} aria-label="뒤로가기">
              <ArrowLeft size={18} strokeWidth={2.2} />
            </button>
            <p className="rl__title">어디서 같이 먹을까요?</p>
            <p className="rl__subtitle">먹고 싶은 음식점을 골라 밥친구를 찾아보세요.</p>
          </div>
          <button type="button" className="rl__map-btn" onClick={() => nav('/map')}>
            <Map size={13} strokeWidth={2.4} /> 지도 보기
          </button>
        </header>

        <label className="rl__search">
          <Search size={16} strokeWidth={2} />
          <input placeholder="음식점 검색" value={keyword}
                 onChange={(e) => setKeyword(e.target.value)} />
        </label>

        {!myPos && GEO_MESSAGE[geoState] && (
          <p className="muted" style={{ marginTop: 8 }}>{GEO_MESSAGE[geoState]}</p>
        )}

        <div className="rl__list">
          {list.map((r) => (
            <div key={r.restaurant_id} className="rl__card"
                 onClick={() => nav(`/restaurants/${r.restaurant_id}/buddies`)}>
              <span className="rl__card-thumb">
                {r.image_url
                  ? <img src={r.image_url} alt="" />
                  : <UtensilsCrossed size={20} strokeWidth={2} />}
              </span>
              <div className="rl__card-body">
                <div className="rl__card-name-row">
                  <span className="rl__card-name ellipsis">{r.name}</span>
                  {r.is_popular && <span className="rl__card-hot">인기</span>}
                </div>
                <p className="rl__card-sub">{formatDistance(r.distance_m)} · {r.food_type_label} · ★{r.rating ?? '-'}</p>
                <p className="rl__card-recruit">{r.recruiting_count}명이 밥친구 찾는 중</p>
              </div>
              <button type="button" className="rl__card-cta"
                      onClick={(e) => { e.stopPropagation(); nav(`/restaurants/${r.restaurant_id}/buddies`); }}>
                밥친구 보기
              </button>
            </div>
          ))}
          {!list.length && <p className="rl__empty">주변에 표시할 음식점이 없습니다.</p>}
        </div>
      </div>
      <BottomNav floating />
    </div>
  );
}
