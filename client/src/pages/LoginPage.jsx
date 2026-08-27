import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import AppBar from '../components/AppBar.jsx';
import { login, getMe } from '../api/endpoints.js';
import { useAuth } from '../context/AuthContext.jsx';

export default function LoginPage() {
  const nav = useNavigate();
  const { signIn, setUser } = useAuth();
  const [form, setForm] = useState({ account: '', password: '' });
  const [show, setShow] = useState(false);
  const [error, setError] = useState('');

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    try {
      const res = await login(form);
      signIn(res);
      setUser(await getMe());
      nav(res.nextStep === 'PROFILE' ? '/signup/profile' : '/home', { replace: true });
    } catch (err) {
      setError(err.response?.data?.message || '로그인에 실패했습니다.');
    }
  };

  return (
    <div className="screen">
      <AppBar title="로그인" />
      <form className="screen__body" onSubmit={submit}>
        <div className="field">
          <label className="field__label">이메일 또는 닉네임</label>
          <input className="input" value={form.account}
                 onChange={(e) => setForm({ ...form, account: e.target.value })} />
        </div>
        <div className="field">
          <label className="field__label">비밀번호</label>
          <div className="row">
            <input className="input" type={show ? 'text' : 'password'} value={form.password}
                   onChange={(e) => setForm({ ...form, password: e.target.value })} />
            {/* 비밀번호 표시 전환 */}
            <button type="button" className="icon-btn" onClick={() => setShow(!show)}>
              {show ? '🙈' : '👁️'}
            </button>
          </div>
        </div>
        {error && <p className="field__msg err">{error}</p>}
        <button className="btn" style={{ marginTop: 12 }}
                disabled={!form.account || !form.password}>로그인</button>
        <div className="row" style={{ justifyContent: 'center', gap: 16, marginTop: 16 }}>
          <Link className="muted" to="/find-password">비밀번호 찾기</Link>
          <Link className="muted" to="/signup">회원가입하기</Link>
        </div>
      </form>
    </div>
  );
}
