import { useNavigate } from 'react-router-dom';
import { Bell } from 'lucide-react';
import { useAuth } from '../context/AuthContext.jsx';
import './Toast.css';

/**
 * 인앱 알림 토스트 — 채팅/보관함에 새 소식이 오면 지금 보고 있는 화면 위에
 * 잠깐(4초) 떴다가 사라진다. 브라우저 알림(권한 필요, 탭이 안 보일 때만 뜸)과
 * 달리 앱을 보고 있는 동안에도 항상 보인다. App.jsx에서 .phone-frame 안에 한 번만 둔다.
 */
export default function Toast() {
  const { toast, dismissToast } = useAuth();
  const nav = useNavigate();
  if (!toast) return null;

  const go = () => {
    dismissToast();
    if (toast.to) nav(toast.to);
  };

  return (
    <div key={toast.key} className="toast" onClick={go} role="button" tabIndex={0}>
      <span className="toast__icon"><Bell size={16} strokeWidth={2} /></span>
      <span className="toast__body">
        <strong className="toast__title">{toast.title}</strong>
        <span className="toast__text">{toast.body}</span>
      </span>
    </div>
  );
}
