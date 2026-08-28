import { Link } from 'react-router-dom';
import './IntroPage.css';

const STATS = [
  { emoji: '👥', value: '2,847 명', label: '오늘 접속한 메이트' },
  { emoji: '🍽️', value: '12,560 번', label: '누적 성사된 매칭' },
];

const FEATURES = [
  { emoji: '🎲', title: '실시간 랜덤 매칭', desc: '내 선호 정보 기반으로 빠르게 이어집니다.' },
  { emoji: '📍', title: '인기 음식점에서 만나기', desc: '자주 가는 매장과 지역에서 메이트를 구해보세요.' },
];

/** 소개 페이지 — 시작하기 / 로그인하기 */
export default function IntroPage() {
  return (
    <div className="screen">
      <header className="intro__header">
        <div className="intro__brand">
          <div className="intro__logo">🍱</div>
          <span className="intro__brand-name">랜덤 밥친구</span>
        </div>
      </header>

      <div className="screen__body">
        <div className="intro">
          <section className="intro__hero">
            <div className="intro__tag"><span>혼밥은 이제 그만! 🙌</span></div>
            <p className="intro__hero-title">오늘 맛있는 식사, 함께할 친구를 만나볼까요?</p>
            <p className="intro__hero-desc">
              내 주변 새로운 밥친구들과 함께 취향에 맞는 맛집을 탐방해보세요.
            </p>
          </section>

          <section className="intro__stats">
            {STATS.map((stat) => (
              <div key={stat.label} className="intro__stat">
                <span className="intro__stat-emoji">{stat.emoji}</span>
                <span className="intro__stat-value">{stat.value}</span>
                <span className="intro__stat-label">{stat.label}</span>
              </div>
            ))}
          </section>

          <section className="intro__features">
            <p className="intro__features-title">이렇게 만나요 ✨</p>
            {FEATURES.map((f) => (
              <div key={f.title} className="intro__feature">
                <span className="intro__feature-icon">{f.emoji}</span>
                <div className="intro__feature-body">
                  <p className="intro__feature-title">{f.title}</p>
                  <p className="intro__feature-desc">{f.desc}</p>
                </div>
              </div>
            ))}
          </section>

          <section className="intro__actions">
            <Link to="/signup" className="intro__submit">시작하기</Link>
            <div className="intro__login-link">
              <span>이미 계정이 있나요?</span>
              <Link to="/login">로그인하기</Link>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
