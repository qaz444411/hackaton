import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import AppBar from '../components/AppBar.jsx';
import { getCodes, saveProfile, getMe, getMyPage } from '../api/endpoints.js';
import { useAuth } from '../context/AuthContext.jsx';
import './ProfileSetupPage.css';

const AXES = [
  { key: 'ei', options: [{ v: 'E', l: 'E' }, { v: 'I', l: 'I' }] },
  { key: 'sn', options: [{ v: 'S', l: 'S' }, { v: 'N', l: 'N' }] },
  { key: 'tf', options: [{ v: 'T', l: 'T' }, { v: 'F', l: 'F' }] },
  { key: 'jp', options: [{ v: 'J', l: 'J' }, { v: 'P', l: 'P' }] },
];

const SPICY_LEVELS = [
  { value: 1, label: '1', sub: '순한맛' }, { value: 2, label: '2', sub: '보통' }, { value: 3, label: '3', sub: '매운맛' },
];
const OILY_LEVELS = [{ value: 1, label: '1' }, { value: 2, label: '2' }, { value: 3, label: '3' }];

const INTEREST_EMOJI = {
  '영화·드라마': '🎬', '음악': '🎵', '게임': '🎮', '운동': '⚽',
  '여행': '✈️', '맛집': '🍜', '개발·IT': '💻', '취업·진로': '💼',
  '반려동물': '🐾', '책': '📚', '일상': '☀️', '학교생활': '🎒',
};

/**
 * 기본선택페이지 — MBTI(4축 토글) / 알레르기 / 매운맛 / 느끼함 / 관심사.
 * 회원가입 때(signup_step='PROFILE')는 처음 입력하는 화면이고, 마이페이지의
 * "취향 설정 변경"(이미 signup_step='DONE')으로 들어오면 같은 화면을 기존 값을
 * 채운 채로 재사용해서 수정 화면으로 쓴다 — 서버 저장 API(saveProfile)는
 * ON DUPLICATE KEY UPDATE 라 신규/수정 구분 없이 그대로 재사용할 수 있다.
 */
export default function ProfileSetupPage() {
  const nav = useNavigate();
  const { user, setUser } = useAuth();
  const isEdit = user?.signup_step !== 'PROFILE';
  const { data: codes } = useQuery({ queryKey: ['codes'], queryFn: getCodes });
  const { data: mypage } = useQuery({ queryKey: ['mypage'], queryFn: getMyPage, enabled: isEdit });
  const [mbti, setMbti] = useState({ ei: null, sn: null, tf: null, jp: null });
  const [f, setF] = useState({
    hasAllergy: null, spicyLevel: null, oilyLevel: null, interestIds: [],
  });

  // 수정 모드면 마이페이지에서 받아온 기존 값으로 한 번 채운다.
  useEffect(() => {
    if (!isEdit || !mypage?.profile) return;
    const p = mypage.profile;
    if (p.mbti_code?.length === 4) {
      setMbti({ ei: p.mbti_code[0], sn: p.mbti_code[1], tf: p.mbti_code[2], jp: p.mbti_code[3] });
    }
    setF({
      hasAllergy: p.has_allergy == null ? null : !!p.has_allergy,
      spicyLevel: p.spicy_level ?? null,
      oilyLevel: p.oily_level ?? null,
      interestIds: (p.interests || []).map((i) => i.id),
    });
  }, [isEdit, mypage]);

  const mbtiCode = mbti.ei && mbti.sn && mbti.tf && mbti.jp ? `${mbti.ei}${mbti.sn}${mbti.tf}${mbti.jp}` : null;
  const valid = mbtiCode && f.hasAllergy !== null && f.spicyLevel && f.oilyLevel;

  const toggleInterest = (id) => {
    setF((prev) => {
      if (prev.interestIds.includes(id)) return { ...prev, interestIds: prev.interestIds.filter((x) => x !== id) };
      if (prev.interestIds.length >= 3) return prev;
      return { ...prev, interestIds: [...prev.interestIds, id] };
    });
  };

  const submit = async () => {
    await saveProfile({ ...f, mbtiCode });
    setUser(await getMe());
    nav(isEdit ? '/mypage' : '/home', { replace: true });
  };

  return (
    <div className="screen">
      <AppBar title={isEdit ? '취향 설정 변경' : '회원가입'} />
      <div className="screen__body">
        <form className="sp2" onSubmit={(e) => { e.preventDefault(); if (valid) submit(); }}>
          <div className="sp2__intro">
            <p className="sp2__title">{user?.nickname} 님!</p>
            <p className="sp2__desc">식사 취향을 알려주세요.</p>
          </div>

          <div className="sp2__mbti-card">
            <div className="sp2__mbti-head">
              <span className="sp2__mbti-head-label">MBTI</span>
              <span className="sp2__mbti-code">{mbtiCode || '?-?-?-?'}</span>
            </div>
            <div className="sp2__mbti-rows">
              {AXES.map(({ key, options }) => (
                <div className="sp2__seg" key={key}>
                  {options.map((o) => (
                    <button key={o.v} type="button"
                            className={`sp2__seg-btn${mbti[key] === o.v ? ' sp2__seg-btn--active' : ''}`}
                            onClick={() => setMbti({ ...mbti, [key]: o.v })}>
                      {o.l}
                    </button>
                  ))}
                </div>
              ))}
            </div>
          </div>

          <div className="sp2__section">
            <p className="sp2__section-title">알레르기가 있나요?</p>
            <div className="sp2__pill-row">
              {[{ v: true, l: '있어요' }, { v: false, l: '없어요' }].map((o) => (
                <button key={String(o.v)} type="button"
                        className={`sp2__pill${f.hasAllergy === o.v ? ' sp2__pill--active' : ''}`}
                        onClick={() => setF({ ...f, hasAllergy: o.v })}>
                  {o.l}
                </button>
              ))}
            </div>
          </div>

          <div className="sp2__section">
            <p className="sp2__section-title">매운걸 잘 드시나요?</p>
            <div className="sp2__scale-row">
              {SPICY_LEVELS.map((o) => (
                <button key={o.value} type="button"
                        className={`sp2__scale-btn${f.spicyLevel === o.value ? ' sp2__scale-btn--active' : ''}`}
                        onClick={() => setF({ ...f, spicyLevel: o.value })}>
                  <span>{o.label}</span>
                  <span className="sp2__scale-sub">{o.sub}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="sp2__section">
            <p className="sp2__section-title">느끼한걸 잘 드시나요?</p>
            <div className="sp2__scale-row">
              {OILY_LEVELS.map((o) => (
                <button key={o.value} type="button"
                        className={`sp2__scale-btn${f.oilyLevel === o.value ? ' sp2__scale-btn--active' : ''}`}
                        onClick={() => setF({ ...f, oilyLevel: o.value })}>
                  <span>{o.label}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="sp2__section">
            <p className="sp2__section-title">관심사 · 최대 3개 선택</p>
            <div className="chip-grid" style={{ marginTop: 7 }}>
              {(codes?.interest || []).map((i) => (
                <button key={i.id} type="button" className="chip"
                        aria-pressed={f.interestIds.includes(i.id)}
                        disabled={!f.interestIds.includes(i.id) && f.interestIds.length >= 3}
                        onClick={() => toggleInterest(i.id)}>
                  {INTEREST_EMOJI[i.name] ? `${INTEREST_EMOJI[i.name]} ${i.name}` : i.name}
                </button>
              ))}
            </div>
          </div>

          <div className="sp2__cta-wrap">
            <button type="submit" className="sp2__submit" disabled={!valid}>
              {isEdit ? '저장하기' : '가입 완료하고 시작하기'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
