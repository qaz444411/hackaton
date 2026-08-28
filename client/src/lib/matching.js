import { getCurrentMatching, saveDraft, startMatching, createProposal } from '../api/endpoints.js';

/**
 * 매칭 요청을 보내려면 "내 matching_request" 가 하나 있어야 한다.
 * (match_proposal.requester_request_id 가 필수)
 *
 * 사용자당 활성 요청은 1건만 허용된다(uq_matching_request_active).
 *  · 이미 SEARCHING 중이면  → 그걸 그대로 쓴다 (새로 만들면 409)
 *  · DRAFT 만 있거나 없으면 → 이 지점 기준으로 만들거나 갱신한다
 */
export async function ensureMyRequest({ kind, placeId, foodTypeCode, mealTimeCode }) {
  const mine = await getCurrentMatching();
  if (mine && mine.status === 'SEARCHING') return mine;

  // 코드값은 반드시 실제 테이블에 있는 것만 쓴다(FK 제약).
  //  food_type_code : ANY / KOREAN / JAPANESE / CHINESE / WESTERN
  //  talk_style_code: EASY / QUIET / TALKATIVE   ← ANY 가 없다
  //  meal_time_code : BREAKFAST / LUNCH / DINNER
  const base = {
    foodTypeCode: foodTypeCode || 'ANY',
    talkStyleCode: 'EASY',
    mealTimeCode: mealTimeCode || 'LUNCH',
    priceMin: 0,
    priceMax: 100000,
  };
  const draft = await saveDraft(kind === 'spot'
    ? { ...base, matchingType: 'SPOT', spotId: Number(placeId) }
    : { ...base, matchingType: 'MAP', restaurantId: Number(placeId) });

  // saveDraft 는 DRAFT 상태로만 만든다. SEARCHING 으로 넘기지 않으면
  // sp_accept_proposal 이 "requester request is not SEARCHING" 으로 거부해서
  // 상대가 수락해도 채팅방이 생기지 않는다.
  await startMatching(draft.id);
  return { ...draft, status: 'SEARCHING' };
}

/**
 * "밥 같이 할까요?" — 상대에게 매칭 요청 전송.
 * 내 요청이 없으면 먼저 만들고 보낸다. 반환값은 생성된 proposal.
 */
export async function proposeTo(buddy, { kind, placeId, foodTypeCode }) {
  const mine = await ensureMyRequest({
    kind, placeId, foodTypeCode,
    mealTimeCode: buddy.meal_time_code,
  });
  return createProposal({ requesterRequestId: mine.id, receiverUserId: buddy.user_id });
}

/** 서버 오류를 사용자가 이해할 수 있는 문장으로 */
export function matchingErrorMessage(e, fallback = '요청을 처리하지 못했어요.') {
  const msg = e?.response?.data?.message;
  if (!msg) return fallback;
  if (msg.includes('이미 존재하는 값')) return '이미 이 분께 매칭을 요청했어요. 보관함에서 확인해 주세요.';
  if (msg.includes('이미 진행 중인 매칭')) return '이미 진행 중인 매칭이 있어요. 홈에서 취소한 뒤 다시 시도해 주세요.';
  return msg;
}
