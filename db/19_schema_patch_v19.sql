-- =====================================================================
--  v19 패치 — 홈 확정 매칭 카드, "가장 최근에 연락 온" 순으로 정렬
--
--  실행 : cd server && npm run db:patch19
--
--  왜 필요한가
--    v15 로 사용자당 확정 매칭 1건 제한을 없애면서, 한 사람이 동시에 여러
--    확정 매칭(채팅방)을 가질 수 있게 됐다. 그런데 홈 상단 카드는 지금
--    "match_id DESC"(가장 최근에 확정된 매칭) 순으로만 골라서, 예전에
--    확정됐지만 방금 메시지가 온 상대가 있어도 그게 아니라 최근에 새로
--    확정된(하지만 대화는 조용한) 상대가 뜨는 문제가 있었다.
--    v_home_confirmed_match 에 chat_room.last_message_at 을 추가하고,
--    라우트(matching.routes.js)에서 이 값(메시지가 아직 없으면 확정 시각)
--    기준 내림차순으로 정렬해서 진짜 "가장 최근에 연락 온" 상대가 뜨게 한다.
-- =====================================================================
USE bapfriend;
SET NAMES utf8mb4;

CREATE OR REPLACE VIEW v_home_confirmed_match AS
SELECT me.user_id,
       m.id             AS match_id,
       m.status,
       m.meal_date,
       m.confirmed_at,
       mt.label         AS meal_time,
       ft.label         AS food_type,
       r.name           AS restaurant_name,
       other.user_id    AS partner_user_id,
       u.nickname       AS partner_nickname,
       u.profile_image  AS partner_image,
       p.mbti_code      AS partner_mbti,
       cr.last_message_at
FROM meal_match m
JOIN match_participant me    ON me.match_id = m.id
JOIN match_participant other ON other.match_id = m.id AND other.user_id <> me.user_id
JOIN users u                 ON u.id = other.user_id
LEFT JOIN user_profile p     ON p.user_id = other.user_id
JOIN meal_time_code mt       ON mt.code = m.meal_time_code
JOIN food_type_code ft       ON ft.code = m.food_type_code
LEFT JOIN restaurant r       ON r.id = m.restaurant_id
LEFT JOIN chat_room cr       ON cr.match_id = m.id
WHERE m.status IN ('CONFIRMED','SCHEDULED');
