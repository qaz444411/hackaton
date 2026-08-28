import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import AppBar from '../components/AppBar.jsx';
import ChipGroup from '../components/ChipGroup.jsx';
import { getCodes, saveDraft, startMatching } from '../api/endpoints.js';

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
        <h2 className="section-title">먹고 싶은 음식</h2>
        <ChipGroup options={(codes?.food || []).map((c) => ({ value: c.code, label: c.label }))}
                   value={f.foodTypeCode} onChange={(v) => setF({ ...f, foodTypeCode: v })} />

        <h2 className="section-title">대화 스타일</h2>
        <ChipGroup options={(codes?.talk || []).map((c) => ({ value: c.code, label: c.label }))}
                   value={f.talkStyleCode} onChange={(v) => setF({ ...f, talkStyleCode: v })} />

        <h2 className="section-title">식사 시간대</h2>
        <ChipGroup options={(codes?.meal || []).map((c) => ({ value: c.code, label: c.label }))}
                   value={f.mealTimeCode} onChange={(v) => setF({ ...f, mealTimeCode: v })} />

        <h2 className="section-title">식사 가격대 (1인 기준)</h2>
        <div className="card">
          <div className="row" style={{ justifyContent: 'space-between', marginBottom: 8 }}>
            <span className="muted">최소 {won(f.priceMin)}</span>
            <strong style={{ color: 'var(--c-primary)' }}>{won(f.priceMin)} ~ {won(f.priceMax)}</strong>
            <span className="muted">최대 {won(f.priceMax)}</span>
          </div>
          {/* 1만원 단위 범위 슬라이더 */}
          <div className="range-row">
            <input type="range" min="0" max="100000" step="10000" value={f.priceMin}
                   onChange={(e) => setF({ ...f, priceMin: Math.min(+e.target.value, f.priceMax) })} />
          </div>
          <div className="range-row">
            <input type="range" min="0" max="100000" step="10000" value={f.priceMax}
                   onChange={(e) => setF({ ...f, priceMax: Math.max(+e.target.value, f.priceMin) })} />
          </div>
        </div>

        <button className="btn" style={{ margin: '24px 0' }} disabled={!valid || busy} onClick={start}>
          {busy ? '매칭 준비 중…' : '매칭 시작하기'}
        </button>
      </div>
    </div>
  );
}
