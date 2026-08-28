import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { X, Search, Check } from 'lucide-react';
import AppBar from '../components/AppBar.jsx';
import { useMyLocation, FALLBACK_CENTER, GEO_MESSAGE } from '../hooks/useKakaoMap.js';
import { getCodes, getRestaurants } from '../api/endpoints.js';
import './RestaurantListPage.css';

/** 밥친구 모집 페이지 — 식당 검색·선택 + 시간대 → 취향 선택으로 이어 모집 시작 */
export default function RecruitPage() {
  const nav = useNavigate();
  const { data: codes } = useQuery({ queryKey: ['codes'], queryFn: getCodes });
  const [keyword, setKeyword] = useState('');
  const [list, setList] = useState([]);
  const [picked, setPicked] = useState(null);
  const [mealTime, setMealTime] = useState(null);
  const { pos: myPos, state: geoState } = useMyLocation({ watch: false });

  // 위치를 못 받으면 기본 좌표로라도 목록을 채운다
  const pos = myPos ?? FALLBACK_CENTER;

  const search = () => getRestaurants({ lat: pos.lat, lng: pos.lng, radius: 3000, keyword }).then(setList);
  useEffect(() => { search(); }, [pos.lat, pos.lng]);

  return (
    <div className="screen">
      <AppBar title="밥친구 모집하기" back={false}
              right={<button className="icon-btn" onClick={() => nav(-1)}><X size={18} /></button>} />
      <div className="screen__body">
        <label className="rl__search">
          <Search size={16} strokeWidth={2} />
          <input placeholder="식당을 검색해주세요" value={keyword}
                 onChange={(e) => setKeyword(e.target.value)}
                 onKeyDown={(e) => e.key === 'Enter' && search()} />
        </label>

        {!myPos && GEO_MESSAGE[geoState] && (
          <p className="muted" style={{ marginTop: 8 }}>{GEO_MESSAGE[geoState]}</p>
        )}

        <h2 className="rc__section-title">식당 선택</h2>
        <div className="rl__list" style={{ marginTop: 0 }}>
          {list.map((r) => (
            <button type="button" key={r.restaurant_id}
                    className={`rc__option${picked?.restaurant_id === r.restaurant_id ? ' rc__option--selected' : ''}`}
                    onClick={() => setPicked(r)}>
              <span className="rc__option-name">{r.name}</span>
              <span className="rc__option-sub">{r.food_type_label} · {r.road_address}</span>
              <span className="rc__option-meta">{r.distance_m}m · ★{r.rating ?? '-'}</span>
              {picked?.restaurant_id === r.restaurant_id && (
                <span className="rc__option-check"><Check size={12} strokeWidth={3} /></span>
              )}
            </button>
          ))}
        </div>

        <h2 className="rc__section-title" style={{ marginTop: 8 }}>모집 정보</h2>
        <p className="rc__sub-title">식사 시간</p>
        <div className="rc__time-row">
          {(codes?.meal || []).map((c) => (
            <button key={c.code} type="button"
                    className={`rc__time-pill${mealTime === c.code ? ' rc__time-pill--active' : ''}`}
                    onClick={() => setMealTime(c.code)}>
              {c.label}
            </button>
          ))}
        </div>
      </div>

      <div className="rc__footer">
        <button className="btn" disabled={!picked || !mealTime}
                onClick={() => nav(`/preference?restaurantId=${picked.restaurant_id}&mealTime=${mealTime}`)}>
          모집 시작하기
        </button>
      </div>
    </div>
  );
}
