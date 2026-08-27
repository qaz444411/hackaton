import { useNavigate } from 'react-router-dom';

export default function AppBar({ title, back = true, right = null, onBack }) {
  const nav = useNavigate();
  return (
    <header className="appbar">
      {back && (
        <button className="icon-btn" onClick={() => (onBack ? onBack() : nav(-1))} aria-label="뒤로가기">
          ‹
        </button>
      )}
      <h1 className="appbar__title">{title}</h1>
      {right}
    </header>
  );
}
