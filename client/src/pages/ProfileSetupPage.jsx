import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import AppBar from '../components/AppBar.jsx';
import ChipGroup from '../components/ChipGroup.jsx';
import { getCodes, saveProfile, getMe } from '../api/endpoints.js';
import { useAuth } from '../context/AuthContext.jsx';

const LEVELS = [{ value: 1, label: '1단계' }, { value: 2, label: '2단계' }, { value: 3, label: '3단계' }];

/** 기본선택페이지 — MBTI / 알레르기 / 매운맛 / 느끼함 / 관심사(최대 3) */
export default function ProfileSetupPage() {
  const nav = useNavigate();
  const { setUser } = useAuth();
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
      <AppBar title="기본 정보 설정" />
      <div className="screen__body">
        <h2 className="section-title">MBTI</h2>
        <ChipGroup options={(codes?.mbti || []).map((m) => ({ value: m, label: m }))}
                   value={f.mbtiCode} onChange={(v) => setF({ ...f, mbtiCode: v })} />

        <h2 className="section-title">음식 알레르기</h2>
        <ChipGroup options={[{ value: true, label: '있음' }, { value: false, label: '없음' }]}
                   value={f.hasAllergy} onChange={(v) => setF({ ...f, hasAllergy: v })} />

        <h2 className="section-title">매운맛 선호도</h2>
        <ChipGroup options={LEVELS} value={f.spicyLevel} onChange={(v) => setF({ ...f, spicyLevel: v })} />

        <h2 className="section-title">느끼한 맛 선호도</h2>
        <ChipGroup options={LEVELS} value={f.oilyLevel} onChange={(v) => setF({ ...f, oilyLevel: v })} />

        <h2 className="section-title">관심사 (최대 3개)</h2>
        <ChipGroup multiple max={3}
                   options={(codes?.interest || []).map((i) => ({ value: i.id, label: i.name }))}
                   value={f.interestIds} onChange={(v) => setF({ ...f, interestIds: v })} />

        <button className="btn" style={{ margin: '24px 0' }} disabled={!valid} onClick={submit}>
          가입 완료하고 시작하기
        </button>
      </div>
    </div>
  );
}
