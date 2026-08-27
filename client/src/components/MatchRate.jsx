/** 취향 일치율 게이지 — fn_taste_match_rate 결과(0~100) */
export default function MatchRate({ value = 0, label = '취향 일치율' }) {
  return (
    <div>
      <div className="muted" style={{ marginBottom: 4 }}>{label}</div>
      <div className="match-rate">
        <div className="match-rate__bar">
          <div className="match-rate__fill" style={{ width: `${value}%` }} />
        </div>
        <span className="match-rate__num">{value}%</span>
      </div>
    </div>
  );
}
