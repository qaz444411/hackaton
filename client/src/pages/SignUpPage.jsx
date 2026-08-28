import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Eye, EyeOff, ChevronDown, Check } from 'lucide-react';
import AppBar from '../components/AppBar.jsx';
import FormField from '../components/FormField.jsx';
import ToggleGroup from '../components/ToggleGroup.jsx';
import { getCodes, checkDuplicate, signup, getMe } from '../api/endpoints.js';
import { useAuth } from '../context/AuthContext.jsx';
import './SignUpPage.css';

const PW_RE = /^(?=.*[A-Za-z])(?=.*\d)(?=.*[^A-Za-z0-9]).{8,}$/;

/** 회원가입 1단계 — 닉네임/이메일 중복확인, 비밀번호 유효성, 나이·성별·선호지역 */
export default function SignUpPage() {
  const nav = useNavigate();
  const { signIn, setUser } = useAuth();
  const { data: codes } = useQuery({ queryKey: ['codes'], queryFn: getCodes });

  const [f, setF] = useState({
    nickname: '', email: '', password: '', passwordConfirm: '', age: '', gender: null, regionCode: null,
  });
  const [dup, setDup] = useState({ nickname: null, email: null });
  const [show, setShow] = useState(false);
  const [showRegionSheet, setShowRegionSheet] = useState(false);
  const [error, setError] = useState('');

  const check = async (field) => {
    const { available } = await checkDuplicate(field, f[field]);
    setDup({ ...dup, [field]: available });
  };

  const pwOk = PW_RE.test(f.password);
  const pwMatch = f.passwordConfirm.length > 0 && f.passwordConfirm === f.password;
  const valid = dup.nickname && dup.email && pwOk && pwMatch && f.age >= 14 && f.gender && f.regionCode;
  const regionLabel = (codes?.region || []).find((r) => r.code === f.regionCode)?.label;

  const submit = async (e) => {
    e.preventDefault();
    try {
      const res = await signup({ ...f, age: Number(f.age) });
      signIn(res);
      setUser(await getMe());
      nav('/signup/profile');   // 2단계: 기본선택페이지
    } catch (err) {
      setError(err.response?.data?.message || '가입에 실패했습니다.');
    }
  };

  return (
    <div className="screen">
      <AppBar title="회원가입" />
      <div className="screen__body">
        <form className="signup" onSubmit={submit}>
          <div className="signup__intro">
            <p className="signup__title">회원가입</p>
            <p className="signup__desc">밥친구를 찾기 위해 몇 가지 정보를 입력해주세요.</p>
          </div>

          <FormField
            label="닉네임"
            placeholder="사용할 닉네임을 입력해주세요"
            value={f.nickname}
            onChange={(v) => { setF({ ...f, nickname: v }); setDup({ ...dup, nickname: null }); }}
            variant={dup.nickname == null ? 'default' : dup.nickname ? 'active' : 'error'}
            hint={dup.nickname == null ? undefined : dup.nickname ? '✓ 사용할 수 있는 닉네임이에요.' : '이미 사용 중인 닉네임이에요.'}
            action={
              <button type="button" className="field__action" disabled={f.nickname.length < 2}
                      onClick={() => check('nickname')}>중복확인</button>
            }
          />

          <FormField
            label="이메일"
            type="email"
            placeholder="id@example.com"
            value={f.email}
            onChange={(v) => { setF({ ...f, email: v }); setDup({ ...dup, email: null }); }}
            variant={dup.email == null ? 'default' : dup.email ? 'active' : 'error'}
            hint={dup.email == null ? undefined : dup.email ? '✓ 사용할 수 있는 이메일이에요.' : '이미 가입된 이메일이에요.'}
            action={
              <button type="button" className="field__action" disabled={!f.email.includes('@')}
                      onClick={() => check('email')}>중복확인</button>
            }
          />

          <FormField
            label="비밀번호"
            type={show ? 'text' : 'password'}
            placeholder="비밀번호를 입력해주세요"
            value={f.password}
            onChange={(v) => setF({ ...f, password: v })}
            variant={f.password ? (pwOk ? 'active' : 'error') : 'default'}
            hint="영문, 숫자, 특수문자를 포함해 8자 이상 입력해주세요."
            suffix={
              <button type="button" className="field__icon-btn" onClick={() => setShow(!show)}
                      aria-label={show ? '비밀번호 숨기기' : '비밀번호 보기'}>
                {show ? <EyeOff size={18} strokeWidth={1.8} /> : <Eye size={18} strokeWidth={1.8} />}
              </button>
            }
          />

          <FormField
            label="비밀번호 확인"
            type={show ? 'text' : 'password'}
            placeholder="비밀번호를 다시 입력해주세요"
            value={f.passwordConfirm}
            onChange={(v) => setF({ ...f, passwordConfirm: v })}
            variant={f.passwordConfirm ? (pwMatch ? 'active' : 'error') : 'default'}
            hint={f.passwordConfirm && !pwMatch ? '비밀번호가 일치하지 않아요.' : undefined}
          />

          <FormField
            label="나이"
            type="number"
            placeholder="나이를 입력해주세요"
            min="14"
            max="100"
            value={f.age}
            onChange={(v) => setF({ ...f, age: v })}
          />

          <label className="field">
            <span className="field__label">성별</span>
            <ToggleGroup
              options={[
                { value: 'MALE', label: '남성' },
                { value: 'FEMALE', label: '여성' },
              ]}
              value={f.gender} onChange={(v) => setF({ ...f, gender: v })} />
          </label>

          <label className="field">
            <span className="field__label">선호 지역</span>
            <button type="button" className="signup__region" onClick={() => setShowRegionSheet(true)}>
              <span>{regionLabel || '지역을 선택해주세요'}</span>
              <ChevronDown size={16} className="signup__region-chevron" />
            </button>
          </label>

          {error && <p className="field__hint field__hint--error">{error}</p>}

          <div className="signup__cta-wrap">
            <button type="submit" className="signup__submit" disabled={!valid}>다음으로</button>
          </div>
        </form>
      </div>

      {showRegionSheet && (
        <>
          <div className="sheet-backdrop" onClick={() => setShowRegionSheet(false)} />
          <div className="sheet">
            <div className="sheet__handle" onClick={() => setShowRegionSheet(false)} />
            <p className="signup__sheet-title">선호 지역 선택</p>
            <div className="signup__sheet-list">
              {(codes?.region || []).map((r) => (
                <button key={r.code} type="button"
                        className={`signup__sheet-item${f.regionCode === r.code ? ' signup__sheet-item--active' : ''}`}
                        onClick={() => { setF({ ...f, regionCode: r.code }); setShowRegionSheet(false); }}>
                  <span>{r.label}</span>
                  {f.regionCode === r.code && <Check size={16} />}
                </button>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
