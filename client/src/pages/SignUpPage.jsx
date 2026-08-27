import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import AppBar from '../components/AppBar.jsx';
import ChipGroup from '../components/ChipGroup.jsx';
import { getCodes, checkDuplicate, signup, getMe } from '../api/endpoints.js';
import { useAuth } from '../context/AuthContext.jsx';

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
      <form className="screen__body" onSubmit={submit}>
        <div className="field">
          <label className="field__label">닉네임</label>
          <div className="row">
            <input className="input" value={f.nickname} onChange={set('nickname')} placeholder="2~10자" />
            <button type="button" className="btn btn--ghost" style={{ width: 90, height: 48 }}
                    disabled={f.nickname.length < 2} onClick={() => check('nickname')}>중복체크</button>
          </div>
          {dup.nickname != null && (
            <p className={`field__msg ${dup.nickname ? 'ok' : 'err'}`}>
              {dup.nickname ? '사용 가능한 닉네임입니다.' : '이미 사용 중인 닉네임입니다.'}
            </p>
          )}
        </div>

        <div className="field">
          <label className="field__label">이메일</label>
          <div className="row">
            <input className="input" type="email" value={f.email} onChange={set('email')} />
            <button type="button" className="btn btn--ghost" style={{ width: 90, height: 48 }}
                    disabled={!f.email.includes('@')} onClick={() => check('email')}>중복체크</button>
          </div>
          {dup.email != null && (
            <p className={`field__msg ${dup.email ? 'ok' : 'err'}`}>
              {dup.email ? '사용 가능한 이메일입니다.' : '이미 가입된 이메일입니다.'}
            </p>
          )}
        </div>

        <div className="field">
          <label className="field__label">비밀번호</label>
          <div className="row">
            <input className="input" type={show ? 'text' : 'password'} value={f.password} onChange={set('password')} />
            <button type="button" className="icon-btn" onClick={() => setShow(!show)}>{show ? '🙈' : '👁️'}</button>
          </div>
          <p className={`field__msg ${f.password ? (pwOk ? 'ok' : 'err') : ''}`}>
            영문·숫자·특수문자 포함 8자 이상
          </p>
        </div>

        <div className="field">
          <label className="field__label">나이</label>
          <input className="input" type="number" min="14" max="100" value={f.age} onChange={set('age')} />
        </div>

        <div className="field">
          <label className="field__label">성별</label>
          <ChipGroup
            options={[{ value: 'MALE', label: '남성' }, { value: 'FEMALE', label: '여성' }]}
            value={f.gender} onChange={(v) => setF({ ...f, gender: v })} />
        </div>

        <div className="field">
          <label className="field__label">선호 지역</label>
          <ChipGroup
            options={(codes?.region || []).map((r) => ({ value: r.code, label: r.label }))}
            value={f.regionCode} onChange={(v) => setF({ ...f, regionCode: v })} />
        </div>

        {error && <p className="field__msg err">{error}</p>}
        <button className="btn" style={{ margin: '12px 0 24px' }} disabled={!valid}>다음으로</button>
      </form>
    </div>
  );
}
