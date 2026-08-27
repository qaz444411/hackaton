import { Link } from 'react-router-dom';

/** 소개 페이지 — 시작하기 / 로그인하기 */
export default function IntroPage() {
  return (
    <div className="screen center" style={{ padding: 32, textAlign: 'center' }}>
      <div style={{ fontSize: 64 }}>🍚</div>
      <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 28, margin: '12px 0 8px' }}>
        랜덤 밥친구
      </h1>
      <p className="muted" style={{ marginBottom: 40 }}>
        오늘 한 끼, 취향이 맞는 사람과 함께.
      </p>
      <div style={{ width: '100%' }}>
        <Link to="/signup"><button className="btn">시작하기</button></Link>
        <Link to="/login">
          <button className="btn btn--ghost" style={{ marginTop: 10 }}>로그인하기</button>
        </Link>
      </div>
    </div>
  );
}
