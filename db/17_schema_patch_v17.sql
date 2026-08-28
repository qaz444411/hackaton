-- =====================================================================
--  v17 패치 — 홈 화면 확정 매칭 카드에 상대 프로필 사진 노출
--
--  실행 : cd server && npm run db:patch17
--
--  왜 필요한가
--    v_home_confirmed_match 뷰가 partner_nickname 은 뽑으면서 정작
--    프로필 사진(u.profile_image)은 셀렉트하지 않았다. 그래서 홈 상단
--    확정 매칭 카드는 상대가 사진을 올려놨어도 항상 기본 아바타만
--    보여줬다 — partner_image 컬럼을 추가한다.
-- =====================================================================
USE bapfriend;
SET NAMES utf8mb4;

CREATE OR REPLACE VIEW v_home_confirmed_match AS
SELECT me.user_id,
       m.id             AS match_id,
       m.status,
       m.meal_date,
       mt.label         AS meal_time,
       ft.label         AS food_type,
       r.name           AS restaurant_name,
       other.user_id    AS partner_user_id,
       u.nickname       AS partner_nickname,
       u.profile_image  AS partner_image,
       p.mbti_code      AS partner_mbti
FROM meal_match m
JOIN match_participant me    ON me.match_id = m.id
JOIN match_participant other ON other.match_id = m.id AND other.user_id <> me.user_id
JOIN users u                 ON u.id = other.user_id
LEFT JOIN user_profile p     ON p.user_id = other.user_id
JOIN meal_time_code mt       ON mt.code = m.meal_time_code
JOIN food_type_code ft       ON ft.code = m.food_type_code
LEFT JOIN restaurant r       ON r.id = m.restaurant_id
WHERE m.status IN ('CONFIRMED','SCHEDULED');
