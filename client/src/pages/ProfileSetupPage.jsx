import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import AppBar from '../components/AppBar.jsx';
import ChipGroup from '../components/ChipGroup.jsx';
import ToggleGroup from '../components/ToggleGroup.jsx';
import { getCodes, saveProfile, getMe } from '../api/endpoints.js';
import { useAuth } from '../context/AuthContext.jsx';
import './ProfileSetupPage.css';

const LEVELS = [{ value: 1, label: '1단계' }, { value: 2, label: '2단계' }, { value: 3, label: '3단계' }];
const ALLERGY_OPTIONS = [{ value: true, label: '있음' }, { value: false, label: '없음' }];

/** 기본선택페이지 — MBTI / 알레르기 / 매운맛 / 느끼함 / 관심사(최대 3) */
export default function ProfileSetupPage() {
  const nav = useNavigate();
  const { user, setUser } = useAuth();
  const { data: codes } = useQuery({ queryKey: ['codes'], queryFn: getCodes });
  const [f, setF] = useState({
    mbtiCode: null, hasAllergy: null, spicyLevel: null, oilyLevel: null, interestIds: [],
  });

  const valid = f.mbtiCode && f.hasAllergy !== null && f.spicyLevel && f.oilyLevel;

  const submit = async () => {
    await saveProfile(f);
    setUser(await getMe());
    nav('/home', { replace: true });   // 회원가입 완료 → 홈
  };

  return (
    <div className="screen">
      <AppBar title="회원가입" />
      <div className="screen__body">
        <form className="sp" onSubmit={(e) => { e.preventDefault(); if (valid) submit(); }}>
          <div className="sp__intro">
            <p className="sp__title">{user?.nickname} 님!</p>
            <p className="sp__desc">밥친구를 찾기 위해 몇 가지 정보를 입력해주세요.</p>
          </div>

          <label className="field sp__section">
            <span className="field__label">MBTI</span>
            <ChipGroup options={(codes?.mbti || []).map((m) => ({ value: m, label: m }))}
                       value={f.mbtiCode} onChange={(v) => setF({ ...f, mbtiCode: v })} />
          </label>

          <label className="field sp__section">
            <span className="field__label">음식 알레르기가 있나요?</span>
            <ToggleGroup options={ALLERGY_OPTIONS}
                         value={f.hasAllergy} onChange={(v) => setF({ ...f, hasAllergy: v })} />
          </label>

          <label className="field sp__section">
            <span className="field__label">매운맛 선호도</span>
            <ToggleGroup options={LEVELS} value={f.spicyLevel} onChange={(v) => setF({ ...f, spicyLevel: v })} />
          </label>

          <label className="field sp__section">
            <span className="field__label">느끼한 맛 선호도</span>
            <ToggleGroup options={LEVELS} value={f.oilyLevel} onChange={(v) => setF({ ...f, oilyLevel: v })} />
          </label>

          <div className="sp__section">
            <p className="sp__section-title">💡 관심사 (최대 3개 선택 가능)</p>
            <ChipGroup multiple max={3}
                       options={(codes?.interest || []).map((i) => ({ value: i.id, label: i.name }))}
                       value={f.interestIds} onChange={(v) => setF({ ...f, interestIds: v })} />
          </div>

          <div className="sp__cta-wrap">
            <button type="submit" className="sp__submit" disabled={!valid}>가입 완료하고 시작하기</button>
          </div>
        </form>
      </div>
    </div>
  );
}
