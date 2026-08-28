import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { Eye, EyeOff } from 'lucide-react';
import AppBar from '../components/AppBar.jsx';
import FormField from '../components/FormField.jsx';
import { login, getMe } from '../api/endpoints.js';
import { useAuth } from '../context/AuthContext.jsx';
import logo from '../assets/logo.png';
import './LoginPage.css';

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
      <AppBar back center={<img className="appbar__logo" src={logo} alt="DO밥" />} />
      <div className="screen__body">
        <div className="login2">
          <form className="login2__form" onSubmit={submit}>
            <FormField
              label="이메일 또는 닉네임"
              placeholder="id@example.com 또는 닉네임"
              value={form.account}
              onChange={(v) => setForm({ ...form, account: v })}
            />
            <FormField
              label="비밀번호"
              type={show ? 'text' : 'password'}
              placeholder="비밀번호를 입력해주세요"
              value={form.password}
              onChange={(v) => setForm({ ...form, password: v })}
              suffix={
                <button type="button" className="field__icon-btn" onClick={() => setShow(!show)}
                        aria-label={show ? '비밀번호 숨기기' : '비밀번호 보기'}>
                  {show ? <EyeOff size={18} strokeWidth={1.8} /> : <Eye size={18} strokeWidth={1.8} />}
                </button>
              }
              hint={error || undefined}
              variant={error ? 'error' : 'default'}
            />

            <div className="login2__submit-wrap">
              <button type="submit" className="login2__submit" disabled={!form.account || !form.password}>
                로그인
              </button>
              <div className="login2__links">
                <Link to="/find-password">비밀번호 찾기</Link>
                <span className="login2__links-divider" />
                <Link className="login2__links--strong" to="/signup">회원가입하기</Link>
              </div>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
