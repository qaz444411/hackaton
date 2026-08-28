-- =====================================================================
--  v16 패치 — 음식점 사진(image_url) 추가
--
--  실행 : cd server && npm run db:patch16
--
--  왜 필요한가
--    카카오 로컬 API는 평점처럼 사진도 안 준다(그래서 지금까지 추천 맛집
--    카드가 아이콘만 보였다). 사진을 직접 모아서 올릴 수 있도록 restaurant
--    에 image_url 컬럼을 추가하고, 두 조회 경로(음식점 배너/목록)가 함께
--    쓰는 v_restaurant_recruiting 뷰에도 노출한다.
--    사진 등록은 server/scripts/set-restaurant-image.js 로 한다.
-- =====================================================================
USE bapfriend;
SET NAMES utf8mb4;

DROP PROCEDURE IF EXISTS sp_v16_patch;
DELIMITER $$
CREATE PROCEDURE sp_v16_patch()
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'restaurant' AND COLUMN_NAME = 'image_url'
  ) THEN
    ALTER TABLE restaurant ADD COLUMN image_url VARCHAR(300) NULL AFTER place_url;
  END IF;
END$$
DELIMITER ;
CALL sp_v16_patch();
DROP PROCEDURE sp_v16_patch;

CREATE OR REPLACE VIEW v_restaurant_recruiting AS
SELECT r.id                AS restaurant_id,
       r.name, r.road_address, r.latitude, r.longitude,
       r.food_type_code, ft.label AS food_type_label,
       r.category_name,
       r.rating, r.review_count, r.place_url, r.image_url,
       COUNT(mr.id)                    AS recruiting_count,
       (COUNT(mr.id) >= 3)             AS is_popular
FROM restaurant r
JOIN food_type_code ft ON ft.code = r.food_type_code
LEFT JOIN matching_request mr
       ON mr.restaurant_id = r.id
      AND mr.matching_type = 'MAP'
      AND mr.status = 'SEARCHING'
WHERE r.is_active = TRUE
GROUP BY r.id;
