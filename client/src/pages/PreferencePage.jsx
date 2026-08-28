import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import AppBar from '../components/AppBar.jsx';
import ChipGroup from '../components/ChipGroup.jsx';
import RangeSlider from '../components/RangeSlider.jsx';
import { getCodes, saveDraft, startMatching } from '../api/endpoints.js';
import './PreferencePage.css';

/** 취향 선택 페이지 — 음식/대화스타일/시간대/가격대 → 매칭 시작 */
export default function PreferencePage() {
  const nav = useNavigate();
  const [sp] = useSearchParams();
  const restaurantId = sp.get('restaurantId') ? Number(sp.get('restaurantId')) : null;
  const spotId = sp.get('spotId') ? Number(sp.get('spotId')) : null;
  const { data: codes } = useQuery({ queryKey: ['codes'], queryFn: getCodes });

  const [f, setF] = useState({
    foodTypeCode: null, talkStyleCode: null, mealTimeCode: null,
    priceMin: 10000, priceMax: 30000,
  });
  const [busy, setBusy] = useState(false);

  const valid = f.foodTypeCode && f.talkStyleCode && f.mealTimeCode && f.priceMin <= f.priceMax;
  const won = (v) => `${(v / 10000).toFixed(0)}만원`;

  const start = async () => {
    setBusy(true);
    try {
      const draft = await saveDraft({
        ...f,
        matchingType: restaurantId ? 'MAP' : spotId ? 'SPOT' : 'RANDOM',
        restaurantId,
        spotId,
      });
      await startMatching(draft.id);
      nav(`/matching/${draft.id}`, { replace: true });
    } catch (e) {
      alert(e.response?.data?.message || '매칭을 시작할 수 없습니다.');
      setBusy(false);
    }
  };

  return (
    <div className="screen">
      <AppBar title="이번 식사 취향" onBack={() => nav('/home')} />
      <div className="screen__body">
        <section className="pref__section">
          <p className="pref__section-title">🍽️ 먹고 싶은 음식</p>
          <ChipGroup options={(codes?.food || []).map((c) => ({ value: c.code, label: c.label }))}
                     value={f.foodTypeCode} onChange={(v) => setF({ ...f, foodTypeCode: v })} />
        </section>

        <section className="pref__section">
          <p className="pref__section-title">💬 대화 스타일</p>
          <ChipGroup options={(codes?.talk || []).map((c) => ({ value: c.code, label: c.label }))}
                     value={f.talkStyleCode} onChange={(v) => setF({ ...f, talkStyleCode: v })} />
        </section>

        <section className="pref__section">
          <p className="pref__section-title">🕒 식사 시간대</p>
          <ChipGroup options={(codes?.meal || []).map((c) => ({ value: c.code, label: c.label }))}
                     value={f.mealTimeCode} onChange={(v) => setF({ ...f, mealTimeCode: v })} />
        </section>

        <section className="pref__section">
          <p className="pref__section-title">💰 식사 가격대 (1인 기준)</p>
          <div className="card pref__price-card">
            <p className="pref__price-value">{won(f.priceMin)} ~ {won(f.priceMax)}</p>
            <RangeSlider
              min={0} max={100000} step={10000}
              valueMin={f.priceMin} valueMax={f.priceMax}
              onChangeMin={(v) => setF({ ...f, priceMin: Math.min(v, f.priceMax) })}
              onChangeMax={(v) => setF({ ...f, priceMax: Math.max(v, f.priceMin) })}
            />
            <div className="pref__price-caption">
              <span>0원</span>
              <span>10만원+</span>
            </div>
          </div>
        </section>
      </div>

      <div className="pref__footer">
        <button type="button" className="pref__submit" disabled={!valid || busy} onClick={start}>
          {busy ? '매칭 준비 중…' : '매칭 시작하기 ✨'}
        </button>
      </div>
    </div>
  );
}
