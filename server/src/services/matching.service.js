import { q, one } from '../db/pool.js';

/**
 * 랜덤/지도 매칭 후보 탐색.
 *
 * 기본(엄격) 조건
 *  · 같은 시간대(sort_order 차 <= 1)
 *  · 음식 종류 일치 또는 한쪽이 ANY
 *  · 가격대 구간 겹침
 *  · 이미 제안을 주고받은 상대 제외
 *
 * 장소 조건
 *  · 한쪽이라도 RANDOM 이면 만날 수 있다(장소를 안 정한 사람은 어디든 갈 수 있다)
 *  · 둘 다 장소를 정했으면(MAP/SPOT) 같은 장소여야 한다
 *
 * relax=true 면 시간대·음식·가격 조건을 풀고 넓게 찾는다.
 * 사용자가 "조건 넓혀서 찾기" 를 눌렀을 때만 쓰며, 결과에 match_level='NEAR' 로 표시된다.
 */
export async function findCandidates(requestId, meId, { limit = 10, relax = false } = {}) {
  const mine = await one(
    `SELECT mr.*, mt.sort_order AS meal_order FROM matching_request mr
       JOIN meal_time_code mt ON mt.code = mr.meal_time_code
      WHERE mr.id = :id AND mr.user_id = :me`, { id: requestId, me: meId });
  if (!mine) return [];

  // 조건 3개를 SQL 안에서 재사용한다 (필터 + match_level 계산)
  const MEAL_OK  = 'ABS(mt.sort_order - :mealOrder) <= 1';
  const FOOD_OK  = "(o.food_type_code = :food OR 'ANY' IN (o.food_type_code, :food))";
  const PRICE_OK = '(o.price_max >= :pmin AND o.price_min <= :pmax)';

  const rows = await q(
    `SELECT o.id            AS matching_request_id,
            u.id            AS user_id,
            u.nickname, u.age, u.gender, u.profile_image,
            p.mbti_code, p.has_allergy, p.spicy_level, p.oily_level,
            ft.label AS food_type, ts.label AS talk_style, mt.label AS meal_time,
            o.price_min, o.price_max,
            o.matching_type,
            r.name  AS restaurant_name,
            s.label AS spot_label,
            fn_taste_match_rate(:me, u.id) AS match_rate,
            (SELECT GROUP_CONCAT(i.name ORDER BY ui.slot)
               FROM user_interest ui JOIN interest i ON i.id = ui.interest_id
              WHERE ui.user_id = u.id) AS interests,
            -- 조건을 모두 만족하면 EXACT, 넓혀서 찾은 결과면 NEAR
            IF(${MEAL_OK} AND ${FOOD_OK} AND ${PRICE_OK}, 'EXACT', 'NEAR') AS match_level
       FROM matching_request o
       JOIN users u             ON u.id = o.user_id AND u.status = 'ACTIVE'
       -- 프로필 미작성자도 후보에 포함한다.
       -- INNER JOIN 이면 기본선택을 건너뛴 사람이 아무 안내 없이 사라져 매칭이 안 잡힌다.
       LEFT JOIN user_profile p ON p.user_id = u.id
       JOIN meal_time_code mt   ON mt.code = o.meal_time_code
       JOIN food_type_code ft   ON ft.code = o.food_type_code
       JOIN talk_style_code ts  ON ts.code = o.talk_style_code
       LEFT JOIN restaurant r   ON r.id = o.restaurant_id
       LEFT JOIN map_spot s     ON s.id = o.spot_id
      WHERE o.status = 'SEARCHING'
        AND o.user_id <> :me
        -- "진짜 랜덤 매칭"(BLIND)은 완전히 분리된 풀이라 여기 후보 탐색에 절대 섞이면 안 된다.
        -- BLIND 는 food_type_code='ANY'/가격 0~100000 처럼 뭐든 통과하는 값으로 채워져 있어서,
        -- 이 줄이 없으면 아래 취향 조건(FOOD_OK/PRICE_OK)을 다 통과해 버려 일반 랜덤 매칭
        -- 사용자한테까지 후보로 노출될 수 있다. 짝짓기는 오직 POST /matching/blind/start 에서만.
        AND o.matching_type <> 'BLIND'
        -- 장소: 한쪽이라도 RANDOM 이면 OK, 둘 다 장소 지정이면 같은 곳이어야 한다
        AND (
              :myType = 'RANDOM'
              OR o.matching_type = 'RANDOM'
              OR (o.matching_type = :myType
                  AND (:restaurantId IS NULL OR o.restaurant_id = :restaurantId)
                  AND (:spotId IS NULL OR o.spot_id = :spotId))
            )
        -- 취향 조건: relax 면 전부 풀고, 아니면 세 조건을 모두 만족해야 한다
        AND (:relax = 1 OR (${MEAL_OK} AND ${FOOD_OK} AND ${PRICE_OK}))
        AND NOT EXISTS (
              SELECT 1 FROM match_proposal mp
               WHERE (mp.requester_request_id = :id AND mp.receiver_user_id = u.id)
                  OR (mp.requester_user_id = u.id AND mp.receiver_user_id = :me
                      AND mp.status IN ('PENDING','ACCEPTED')))
      ORDER BY (match_level = 'EXACT') DESC, match_rate DESC, o.started_at ASC
      LIMIT :limit`,
    { me: meId, id: requestId,
      myType: mine.matching_type,
      restaurantId: mine.restaurant_id, spotId: mine.spot_id,
      mealOrder: mine.meal_order, food: mine.food_type_code,
      pmin: mine.price_min, pmax: mine.price_max,
      relax: relax ? 1 : 0,
      limit: String(limit) });

  return rows.map((x) => ({ ...x, interests: x.interests ? x.interests.split(',') : [] }));
}
