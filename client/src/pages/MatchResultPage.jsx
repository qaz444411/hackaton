import { useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import AppBar from '../components/AppBar.jsx';
import ProfileCard from '../components/ProfileCard.jsx';
import { getCandidates, createProposal } from '../api/endpoints.js';
import { matchingErrorMessage } from '../lib/matching.js';

/** 매칭 결과 페이지 — 상대 프로필 + 취향 일치율 / 같이 밥 먹기 · 다른 친구 찾기 */
export default function MatchResultPage() {
  const { id } = useParams();
  const nav = useNavigate();
  const [sp] = useSearchParams();
  // 홈에서 "조건 넓혀서 찾기" 로 들어오면 완화된 조건으로 후보를 받는다
  const relax = sp.get('relax') === '1';
  const [idx, setIdx] = useState(0);
  const { data = [], isLoading } = useQuery({
    queryKey: ['candidates', id, relax],
    queryFn: () => getCandidates(id, relax),
  });

  if (isLoading) return <div className="screen center">불러오는 중…</div>;
  const p = data[idx];

  if (!p) {
    return (
      <div className="screen">
        <AppBar title="매칭 결과" onBack={() => nav('/home')} />
        <div className="screen__body center" style={{ textAlign: 'center', paddingTop: 80 }}>
          <p className="muted">조건에 맞는 밥친구를 더 찾지 못했어요.</p>
          <button className="btn" style={{ marginTop: 20 }} onClick={() => nav('/preference')}>
            조건 바꿔서 다시 찾기
          </button>
        </div>
      </div>
    );
  }

  /** 같이 밥 먹기 → 매칭 요청(제안) 전송 후 대기 화면 */
  const accept = async () => {
    try {
      const proposal = await createProposal({
        requesterRequestId: Number(id),
        receiverUserId: p.user_id,
      });
      nav(`/proposals/${proposal.id}/wait`);
    } catch (e) {
      alert(matchingErrorMessage(e, '매칭 요청을 보내지 못했어요.'));
    }
  };

  return (
    <div className="screen">
      <AppBar title="매칭 결과" onBack={() => nav('/home')} />
      <div className="screen__body">
        {/* 조건을 넓혀 찾은 상대는 취향이 다를 수 있으니 미리 알린다 */}
        {p.match_level === 'NEAR' && (
          <div className="near-note">
            조건을 넓혀서 찾은 분이에요. 시간대·음식·가격이 조금 다를 수 있어요.
          </div>
        )}

        <ProfileCard variant="hero" p={p} onClick={() => nav(`/users/${p.user_id}`)} />

        <h2 className="section-title">이번 식사 취향</h2>
        <div className="card">
          <div className="row" style={{ justifyContent: 'space-between' }}>
            <span className="muted">먹고 싶은 음식</span><strong>{p.food_type}</strong>
          </div>
          <div className="row" style={{ justifyContent: 'space-between', marginTop: 8 }}>
            <span className="muted">대화 스타일</span><strong>{p.talk_style}</strong>
          </div>
          <div className="row" style={{ justifyContent: 'space-between', marginTop: 8 }}>
            <span className="muted">시간대</span><strong>{p.meal_time}</strong>
          </div>
          <div className="row" style={{ justifyContent: 'space-between', marginTop: 8 }}>
            <span className="muted">가격대</span>
            <strong>{p.price_min / 10000}만 ~ {p.price_max / 10000}만원</strong>
          </div>
          {p.restaurant_name && (
            <div className="row" style={{ justifyContent: 'space-between', marginTop: 8 }}>
              <span className="muted">음식점</span><strong>{p.restaurant_name}</strong>
            </div>
          )}
        </div>

        <button className="btn" style={{ marginTop: 24 }} onClick={accept}>💬 같이 밥 먹기</button>
        <button className="btn btn--line" style={{ marginTop: 10, marginBottom: 24 }}
                onClick={() => setIdx((i) => i + 1)}>
          다른 친구 찾기
        </button>
      </div>
    </div>
  );
}
