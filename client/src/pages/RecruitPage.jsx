import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { X, Search, Check } from 'lucide-react';
import AppBar from '../components/AppBar.jsx';
import { useMyLocation, FALLBACK_CENTER, GEO_MESSAGE } from '../hooks/useKakaoMap.js';
import { useDebouncedValue } from '../hooks/useDebouncedValue.js';
import { getRestaurants } from '../api/endpoints.js';
import { formatDistance } from '../lib/format.js';
import './RestaurantListPage.css';

/**
 * 밥친구 모집 페이지 — 식당 검색·선택 → 취향 선택(시간대 포함)으로 이어 모집 시작.
 * 예전엔 여기서도 식사 시간을 따로 골라야 버튼이 눌렸는데, 그 값은 다음 화면
 * (PreferencePage)으로 전달되지 않고 그냥 버려졌다 — 시간대는 거기서 다시
 * 물어보므로, 여기선 식당만 고르면 바로 넘어가게 뺐다.
 */
export default function RecruitPage() {
  const nav = useNavigate();
  const [keyword, setKeyword] = useState('');
  const debouncedKeyword = useDebouncedValue(keyword, 300);
  const [list, setList] = useState([]);
  const [picked, setPicked] = useState(null);
  const { pos: myPos, state: geoState } = useMyLocation({ watch: false });

  // 위치를 못 받으면 기본 좌표로라도 목록을 채운다
  const pos = myPos ?? FALLBACK_CENTER;

  // 입력을 멈추면(300ms) 자동으로 검색
  useEffect(() => {
    getRestaurants({ lat: pos.lat, lng: pos.lng, radius: 3000, keyword: debouncedKeyword }).then(setList);
  }, [pos.lat, pos.lng, debouncedKeyword]);

  return (
    <div className="screen">
      <AppBar title="밥친구 모집하기" back={false}
              right={<button className="icon-btn" onClick={() => nav(-1)}><X size={18} /></button>} />
      <div className="screen__body">
        <label className="rl__search">
          <Search size={16} strokeWidth={2} />
          <input placeholder="식당을 검색해주세요" value={keyword}
                 onChange={(e) => setKeyword(e.target.value)} />
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
              <span className="rc__option-meta">{formatDistance(r.distance_m)} · ★{r.rating ?? '-'}</span>
              {picked?.restaurant_id === r.restaurant_id && (
                <span className="rc__option-check"><Check size={12} strokeWidth={3} /></span>
              )}
            </button>
          ))}
        </div>
      </div>

      <div className="rc__footer">
        <button className="btn" disabled={!picked}
                onClick={() => nav(`/preference?restaurantId=${picked.restaurant_id}`)}>
          모집 시작하기
        </button>
      </div>
    </div>
  );
}
