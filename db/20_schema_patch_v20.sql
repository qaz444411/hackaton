-- =====================================================================
--  v20 패치 — v_restaurant_buddy 에 음식 종류(food_type) 추가
--
--  실행 : cd server && npm run db:patch20
--
--  왜 필요한가
--    지도에서 식당 핀을 눌렀을 때 모집 중인 사람의 취향(MBTI/맵기/느끼함/
--    대화스타일/식사시간/가격대/먹고싶은 음식)을 보여주려는데, v_spot_buddy
--    는 food_type 을 이미 내려주는 반면 v_restaurant_buddy 는 애초에
--    food_type_code 조인이 빠져 있었다(v2에서 만들 때 누락된 걸로 보인다) —
--    같은 패턴으로 맞춘다.
-- =====================================================================
USE bapfriend;
SET NAMES utf8mb4;

CREATE OR REPLACE VIEW v_restaurant_buddy AS
SELECT mr.restaurant_id,
       mr.id            AS matching_request_id,
       u.id             AS user_id,
       u.nickname, u.age, u.gender, u.profile_image,
       ts.label         AS talk_style,
       mt.label         AS meal_time,
       ft.label         AS food_type,
       mr.price_min, mr.price_max,
       p.mbti_code, p.has_allergy, p.spicy_level, p.oily_level
FROM matching_request mr
JOIN users u            ON u.id = mr.user_id AND u.status = 'ACTIVE'
JOIN talk_style_code ts ON ts.code = mr.talk_style_code
JOIN meal_time_code  mt ON mt.code = mr.meal_time_code
JOIN food_type_code  ft ON ft.code = mr.food_type_code
LEFT JOIN user_profile p ON p.user_id = u.id
WHERE mr.matching_type = 'MAP' AND mr.status = 'SEARCHING';
