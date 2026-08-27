import { useNavigate, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import AppBar from '../components/AppBar.jsx';
import ProfileCard from '../components/ProfileCard.jsx';
import { getRestaurant, getBuddies, getCurrentMatching, createProposal, saveDraft } from '../api/endpoints.js';

/** 음식점별 밥친구 목록 — 취향 일치율 순, 매칭 요청 전송 */
export default function BuddyListPage() {
  const { id } = useParams();
  const nav = useNavigate();
  const { data: place } = useQuery({ queryKey: ['restaurant', id], queryFn: () => getRestaurant(id) });
  const { data: buddies = [] } = useQuery({ queryKey: ['buddies', id], queryFn: () => getBuddies(id) });

  /** 내 활성 요청이 없으면 이 음식점 기준으로 즉석 생성 후 제안 */
  const request = async (b) => {
    let mine = await getCurrentMatching();
    if (!mine) {
      mine = await saveDraft({
        matchingType: 'MAP', restaurantId: Number(id),
        foodTypeCode: place.food_type_code, talkStyleCode: 'ANY',
        mealTimeCode: b.meal_time_code || 'LUNCH', priceMin: 0, priceMax: 100000,
      });
    }
    const proposal = await createProposal({ requesterRequestId: mine.id, receiverUserId: b.user_id });
    nav(`/proposals/${proposal.id}/wait`);
  };

  return (
    <div className="screen">
      <AppBar title={place?.name || '밥친구 목록'} />
      <div className="screen__body">
        {place && (
          <div className="card">
            <div className="row" style={{ justifyContent: 'space-between' }}>
              <strong>{place.name}</strong>
              {place.is_popular ? <span className="tag">🔥 인기</span> : null}
            </div>
            <p className="muted" style={{ marginTop: 4 }}>
              ⭐ {place.rating ?? '-'} · {place.food_type_label} · {place.road_address}
            </p>
          </div>
        )}

        <h2 className="section-title">모집 중인 밥친구 {buddies.length}명</h2>
        <div className="list" style={{ paddingBottom: 24 }}>
          {buddies.map((b) => (
            <ProfileCard key={b.user_id} p={b}
              footer={
                <button className="btn" style={{ marginTop: 12, height: 44 }}
                        onClick={() => request(b)}>매칭 요청하기</button>
              } />
          ))}
          {!buddies.length && <p className="muted">아직 이 음식점에서 모집 중인 밥친구가 없어요.</p>}
        </div>
      </div>
    </div>
  );
}
