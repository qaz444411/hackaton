import { useNavigate, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import AppBar from '../components/AppBar.jsx';
import ProfileCard from '../components/ProfileCard.jsx';
import './BuddyListPage.css';
import { getRestaurant, getBuddies, getSpot, getSpotBuddies } from '../api/endpoints.js';
import { proposeTo, matchingErrorMessage } from '../lib/matching.js';

/**
 * 밥친구 목록 — 취향 일치율 순, 매칭 요청 전송.
 * 음식점 핀(kind='restaurant')과 지도 마커(kind='spot') 둘 다 여기로 들어온다.
 * 두 API 의 응답 모양을 서버에서 맞춰 놨기 때문에 화면은 거의 공유한다.
 */
export default function BuddyListPage({ kind = 'restaurant' }) {
  const { id } = useParams();
  const nav = useNavigate();
  const isSpot = kind === 'spot';

  const { data: place } = useQuery({
    queryKey: [kind, id],
    queryFn: () => (isSpot ? getSpot(id) : getRestaurant(id)),
  });
  const { data: buddies = [] } = useQuery({
    queryKey: [kind, id, 'buddies'],
    queryFn: () => (isSpot ? getSpotBuddies(id) : getBuddies(id)),
  });

  const title = isSpot ? place?.label : place?.name;

  /** "밥 같이 할까요?" — 내 활성 요청이 없으면 이 지점 기준으로 만들고 요청을 보낸다 */
  const request = async (b) => {
    try {
      const proposal = await proposeTo(b, {
        kind, placeId: Number(id),
        // 마커에는 음식 종류가 없다 (ANY 면 무엇이든 매칭)
        foodTypeCode: isSpot ? 'ANY' : place?.food_type_code,
      });
      nav(`/proposals/${proposal.id}/wait`);
    } catch (e) {
      alert(matchingErrorMessage(e, '매칭 요청을 보내지 못했어요.'));
    }
  };

  return (
    <div className="screen">
      <AppBar title={title || '밥친구 목록'} onBack={() => nav(-1)} />
      <div className="screen__body">
        {place && (
          <div className="bl__place">
            <div className="bl__place-thumb" aria-hidden="true" />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div className="bl__place-name-row">
                <p className="bl__place-name">{title}</p>
                {place.is_popular && <span className="tag tag--hot">인기</span>}
              </div>
              <p className="bl__place-desc">
                {isSpot
                  ? (place.address || '지도에 찍힌 지점')
                  : `오늘 여기서 같이 먹을 사람 ${buddies.length}명`}
              </p>
            </div>
          </div>
        )}

        <h2 className="section-title">모집 중인 밥친구 {buddies.length}명</h2>
        <div className="list" style={{ paddingBottom: 24 }}>
          {buddies.map((b) => (
            <ProfileCard key={b.user_id} p={b}
              footer={
                <button type="button" className="bl__cta" onClick={() => request(b)}>같이 먹기</button>
              } />
          ))}
          {!buddies.length && (
            <p className="muted">
              {isSpot
                ? '아직 이 지점에서 모집 중인 밥친구가 없어요.'
                : '아직 이 음식점에서 모집 중인 밥친구가 없어요.'}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
