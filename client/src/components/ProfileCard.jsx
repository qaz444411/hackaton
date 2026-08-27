import MatchRate from './MatchRate.jsx';

const SPICY = { 1: '순한맛', 2: '보통', 3: '아주 매운맛' };
const OILY = { 1: '담백', 2: '보통', 3: '느끼한 것도 OK' };

export default function ProfileCard({ p, showRate = true, footer = null, onClick }) {
  return (
    <div className="card" onClick={onClick} style={{ cursor: onClick ? 'pointer' : 'default' }}>
      <div className="list-item">
        <img className="avatar" src={p.profile_image || '/avatar-default.png'} alt="" />
        <div className="list-item__body">
          <strong>{p.nickname}</strong>{' '}
          <span className="muted">{p.age}세 · {p.gender === 'MALE' ? '남' : '여'}</span>
          <div className="muted">{p.mbti_code} · {p.talk_style || ''}</div>
        </div>
      </div>

      <div className="row" style={{ flexWrap: 'wrap', gap: 6, marginTop: 10 }}>
        {(p.interests || []).slice(0, 3).map((i) => <span key={i} className="tag">#{i}</span>)}
      </div>

      <div className="muted" style={{ marginTop: 8 }}>
        알레르기 {p.has_allergy ? '있음' : '없음'} · 매운맛 {SPICY[p.spicy_level]} · {OILY[p.oily_level]}
      </div>

      {showRate && p.match_rate != null && (
        <div style={{ marginTop: 12 }}><MatchRate value={p.match_rate} /></div>
      )}
      {footer}
    </div>
  );
}
