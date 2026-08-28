import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Eye, EyeOff } from 'lucide-react';
import AppBar from '../components/AppBar.jsx';
import ChipGroup from '../components/ChipGroup.jsx';
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
    nickname: '', email: '', password: '', age: '', gender: null, regionCode: null,
  });
  const [dup, setDup] = useState({ nickname: null, email: null });
  const [show, setShow] = useState(false);
  const [error, setError] = useState('');

  const set = (k) => (e) => {
    setF({ ...f, [k]: e.target.value });
    if (k in dup) setDup({ ...dup, [k]: null });
  };

  const check = async (field) => {
    const { available } = await checkDuplicate(field, f[field]);
    setDup({ ...dup, [field]: available });
  };

  const pwOk = PW_RE.test(f.password);
  const valid = dup.nickname && dup.email && pwOk && f.age >= 14 && f.gender && f.regionCode;

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
            <p className="signup__title">반가워요! 👋</p>
            <p className="signup__desc">밥친구를 찾기 위해 몇 가지 정보를 입력해주세요.</p>
          </div>

          <FormField
            label="닉네임"
            placeholder="2~10자"
            value={f.nickname}
            onChange={(v) => { setF({ ...f, nickname: v }); setDup({ ...dup, nickname: null }); }}
            variant={dup.nickname == null ? 'default' : dup.nickname ? 'active' : 'error'}
            hint={dup.nickname == null ? undefined : dup.nickname ? '✓ 사용할 수 있는 닉네임이에요.' : '이미 사용 중인 닉네임이에요.'}
            action={
              <button type="button" className="field__action" disabled={f.nickname.length < 2}
                      onClick={() => check('nickname')}>중복체크</button>
            }
          />

          <FormField
            label="이메일"
            type="email"
            value={f.email}
            onChange={(v) => { setF({ ...f, email: v }); setDup({ ...dup, email: null }); }}
            variant={dup.email == null ? 'default' : dup.email ? 'active' : 'error'}
            hint={dup.email == null ? undefined : dup.email ? '✓ 사용할 수 있는 이메일이에요.' : '이미 가입된 이메일이에요.'}
            action={
              <button type="button" className="field__action" disabled={!f.email.includes('@')}
                      onClick={() => check('email')}>중복체크</button>
            }
          />

          <FormField
            label="비밀번호"
            type={show ? 'text' : 'password'}
            value={f.password}
            onChange={(v) => setF({ ...f, password: v })}
            variant={f.password ? (pwOk ? 'active' : 'error') : 'default'}
            hint="* 영문, 숫자, 특수문자를 포함해 8자 이상 입력해주세요."
            suffix={
              <button type="button" className="field__icon-btn" onClick={() => setShow(!show)}
                      aria-label={show ? '비밀번호 숨기기' : '비밀번호 보기'}>
                {show ? <EyeOff size={18} strokeWidth={1.8} /> : <Eye size={18} strokeWidth={1.8} />}
              </button>
            }
          />

          <FormField
            label="만 나이"
            type="number"
            min="14"
            max="100"
            value={f.age}
            onChange={(v) => setF({ ...f, age: v })}
            suffix={<span className="field__unit">세</span>}
          />

          <label className="field">
            <span className="field__label">성별</span>
            <ToggleGroup
              options={[
                { value: 'MALE', label: '남성', emoji: '🙋‍♂️' },
                { value: 'FEMALE', label: '여성', emoji: '🙋‍♀️' },
              ]}
              value={f.gender} onChange={(v) => setF({ ...f, gender: v })} />
          </label>

          <label className="field">
            <span className="field__label">선호 지역</span>
            <ChipGroup
              options={(codes?.region || []).map((r) => ({ value: r.code, label: r.label }))}
              value={f.regionCode} onChange={(v) => setF({ ...f, regionCode: v })} />
          </label>

          {error && <p className="field__hint field__hint--error">{error}</p>}

          <div className="signup__cta-wrap">
            <button type="submit" className="signup__submit" disabled={!valid}>다음으로</button>
          </div>
        </form>
      </div>
    </div>
  );
}
