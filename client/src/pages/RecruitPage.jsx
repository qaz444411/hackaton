import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import AppBar from '../components/AppBar.jsx';
import ChipGroup from '../components/ChipGroup.jsx';
import { getCodes, getRestaurants } from '../api/endpoints.js';

/** 밥친구 모집 페이지 — 식당 검색·선택 + 시간대 → 취향 선택으로 이어 모집 시작 */
export default function RecruitPage() {
  const nav = useNavigate();
  const { data: codes } = useQuery({ queryKey: ['codes'], queryFn: getCodes });
  const [keyword, setKeyword] = useState('');
  const [list, setList] = useState([]);
  const [picked, setPicked] = useState(null);
  const [mealTime, setMealTime] = useState(null);
  const [pos, setPos] = useState({ lat: 35.9675, lng: 126.7370 });

  useEffect(() => {
    navigator.geolocation?.getCurrentPosition(
      (p) => setPos({ lat: p.coords.latitude, lng: p.coords.longitude }), () => {});
  }, []);

  const search = () => getRestaurants({ ...pos, radius: 3000, keyword }).then(setList);
  useEffect(() => { search(); }, [pos]);

  return (
    <div className="screen">
      <AppBar title="밥친구 모집하기"
              onBack={() => nav(-1)}
              right={<button className="icon-btn" onClick={() => nav('/map')}>✕</button>} />
      <div className="screen__body">
        <input className="input" placeholder="함께 식사할 음식점 검색" value={keyword}
               onChange={(e) => setKeyword(e.target.value)}
               onKeyDown={(e) => e.key === 'Enter' && search()} />

        <h2 className="section-title">음식점 선택</h2>
        <div className="list">
          {list.map((r) => (
            <div key={r.restaurant_id} className="card"
                 style={{ borderColor: picked?.restaurant_id === r.restaurant_id
                   ? 'var(--c-primary)' : 'var(--c-line)' }}
                 onClick={() => setPicked(r)}>
              <strong>{r.name}</strong>
              <p className="muted" style={{ marginTop: 4 }}>
                {r.food_type_label} · {r.road_address} · {r.distance_m}m · ⭐ {r.rating ?? '-'}
              </p>
            </div>
          ))}
        </div>

        <h2 className="section-title">식사 시간대</h2>
        <ChipGroup options={(codes?.meal || []).map((c) => ({ value: c.code, label: c.label }))}
                   value={mealTime} onChange={setMealTime} />

        <button className="btn" style={{ margin: '24px 0' }}
                disabled={!picked || !mealTime}
                onClick={() => nav(`/preference?restaurantId=${picked.restaurant_id}&mealTime=${mealTime}`)}>
          모집 시작하기
        </button>
      </div>
    </div>
  );
}
