import { q, one } from '../db/pool.js';

/**
 * 랜덤/지도 매칭 후보 탐색.
 *  · 같은 시간대(sort_order 차 <= 1)
 *  · 음식 종류 일치 또는 한쪽이 ANY
 *  · 가격대 구간 겹침
 *  · 이미 제안을 주고받은 상대 제외
 *  · MAP 이면 같은 음식점에서 모집 중인 사람만
 */
export async function findCandidates(requestId, meId, limit = 10) {
  const mine = await one(
    `SELECT mr.*, mt.sort_order AS meal_order FROM matching_request mr
       JOIN meal_time_code mt ON mt.code = mr.meal_time_code
      WHERE mr.id = :id AND mr.user_id = :me`, { id: requestId, me: meId });
  if (!mine) return [];

  return q(
    `SELECT o.id            AS matching_request_id,
            u.id            AS user_id,
            u.nickname, u.age, u.gender, u.profile_image,
            p.mbti_code, p.has_allergy, p.spicy_level, p.oily_level,
            ft.label AS food_type, ts.label AS talk_style, mt.label AS meal_time,
            o.price_min, o.price_max, r.name AS restaurant_name,
            fn_taste_match_rate(:me, u.id) AS match_rate,
            (SELECT GROUP_CONCAT(i.name ORDER BY ui.slot)
               FROM user_interest ui JOIN interest i ON i.id = ui.interest_id
              WHERE ui.user_id = u.id) AS interests
       FROM matching_request o
       JOIN users u             ON u.id = o.user_id AND u.status = 'ACTIVE'
       JOIN user_profile p      ON p.user_id = u.id
       JOIN meal_time_code mt   ON mt.code = o.meal_time_code
       JOIN food_type_code ft   ON ft.code = o.food_type_code
       JOIN talk_style_code ts  ON ts.code = o.talk_style_code
       LEFT JOIN restaurant r   ON r.id = o.restaurant_id
      WHERE o.status = 'SEARCHING'
        AND o.user_id <> :me
        AND o.matching_type = :type
        AND (:restaurantId IS NULL OR o.restaurant_id = :restaurantId)
        AND ABS(mt.sort_order - :mealOrder) <= 1
        AND (o.food_type_code = :food OR 'ANY' IN (o.food_type_code, :food))
        AND o.price_max >= :pmin AND o.price_min <= :pmax
        AND NOT EXISTS (
              SELECT 1 FROM match_proposal mp
               WHERE (mp.requester_request_id = :id AND mp.receiver_user_id = u.id)
                  OR (mp.requester_user_id = u.id AND mp.receiver_user_id = :me
                      AND mp.status IN ('PENDING','ACCEPTED')))
      ORDER BY match_rate DESC, o.started_at ASC
      LIMIT :limit`,
    { me: meId, id: requestId, type: mine.matching_type,
      restaurantId: mine.restaurant_id, mealOrder: mine.meal_order,
      food: mine.food_type_code, pmin: mine.price_min, pmax: mine.price_max,
      limit: String(limit) })
    .then((rows) => rows.map((x) => ({ ...x, interests: x.interests ? x.interests.split(',') : [] })));
}
