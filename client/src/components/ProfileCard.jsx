import MatchRate from './MatchRate.jsx';
import './ProfileCard.css';

const SPICY = { 1: '순한맛', 2: '보통', 3: '아주 매운맛' };
const OILY = { 1: '담백', 2: '보통', 3: '느끼한 것도 OK' };

/**
 * 상대 프로필 카드 — app/ 디자인 이식
 * @param {'list'|'hero'} variant 'list' = 밥친구 목록 카드, 'hero' = 매칭 결과 상세 카드
 */
export default function ProfileCard({ p, showRate = true, footer = null, onClick, variant = 'list' }) {
  const isHero = variant === 'hero';
  const interests = (p.interests || []).slice(0, 3);
  const conditionText = `알레르기 ${p.has_allergy ? '있음' : '없음'} · 매운맛 ${SPICY[p.spicy_level] ?? '-'} · ${OILY[p.oily_level] ?? '-'}`;

  return (
    <div className={`profile-card${isHero ? ' profile-card--hero' : ''}`}
         onClick={onClick} style={{ cursor: onClick ? 'pointer' : 'default' }}>
      <div className="profile-card__banner">
        <img className="profile-card__avatar" src={p.profile_image || '/avatar-default.png'} alt="" />
        <div className="profile-card__meta">
          <p className="profile-card__name">{p.nickname}</p>
          <p className="profile-card__sub">
            {isHero ? `${p.age}세` : `${p.age}세 · ${p.gender === 'MALE' ? '남' : '여'}`}
          </p>
          {!isHero && <p className="profile-card__sub">{p.mbti_code}{p.talk_style ? ` · ${p.talk_style}` : ''}</p>}
        </div>
        {isHero && showRate && p.match_rate != null && (
          <span className="profile-card__badge">🔥 취향 일치</span>
        )}
        {!isHero && showRate && p.match_rate != null && (
          <div className="profile-card__rate-badge">
            <span className="profile-card__rate-badge-value">{p.match_rate}%</span>
            <span className="profile-card__rate-badge-label">취향 일치</span>
          </div>
        )}
      </div>

      <div className="profile-card__body">
        {isHero && (
          <div className="profile-card__info-row">
            <span className="profile-card__info-label">🍣 좋아하는 음식</span>
            <span className="profile-card__info-value">{p.food_type || p.talk_style || '-'}</span>
          </div>
        )}

        {interests.length > 0 && (
          <div className="profile-card__interests">
            <p className="profile-card__interests-label">{isHero ? '🎯 관심사' : '관심사'}</p>
            <div className="profile-card__tags">
              {interests.map((i) => <span key={i} className="profile-card__tag">#{i}</span>)}
            </div>
          </div>
        )}

        <p className="profile-card__extra">{conditionText}</p>

        {!isHero && showRate && p.match_rate != null && (
          <div className="profile-card__progress-row">
            <div className="profile-card__track">
              <div className="profile-card__fill" style={{ width: `${p.match_rate}%` }} />
            </div>
            <span className="profile-card__percent">{p.match_rate}%</span>
          </div>
        )}

        {isHero && showRate && p.match_rate != null && (
          <div style={{ marginTop: 12 }}><MatchRate value={p.match_rate} /></div>
        )}

        {footer && <div className="profile-card__footer">{footer}</div>}
      </div>
    </div>
  );
}
