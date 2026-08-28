import { useNavigate } from 'react-router-dom';
import './AppBar.css';

export default function AppBar({ title, back = true, right = null, onBack }) {
  const nav = useNavigate();
  return (
    <header className="appbar">
      {back ? (
        <button className="icon-btn" onClick={() => (onBack ? onBack() : nav(-1))} aria-label="뒤로가기">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path
              d="M15 4.5L7.5 12L15 19.5"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>
      ) : (
        <span className="icon-btn" aria-hidden="true" />
      )}
      <h1 className="appbar__title">{title}</h1>
      {right ?? <span className="icon-btn" aria-hidden="true" />}
    </header>
  );
}
