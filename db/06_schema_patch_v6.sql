-- ===================================================================
-- v6: 지도 핀에 음식 종류 아이콘을 붙이기 위해 뷰에 category_name 추가
--
--   restaurant.category_name 에는 카카오 로컬 API 의 세분류가 들어 있다.
--     "음식점 > 일식 > 초밥,롤"  "음식점 > 한식 > 국밥"  "음식점 > 양식 > 피자"
--   food_type_code 는 4종(한/중/일/양)뿐이라 아이콘을 다양하게 줄 수 없다.
--   데이터는 이미 채워져 있는데 뷰가 내보내지 않아 화면에서 못 쓰고 있었다.
--
-- 뷰 정의만 바꾼다. 테이블·데이터 변경 없음.
-- CREATE OR REPLACE VIEW 라 몇 번 실행해도 안전하다.
--
-- 실행 : cd server && npm run db:patch6
-- ===================================================================
USE bapfriend;
SET NAMES utf8mb4;

CREATE OR REPLACE VIEW v_restaurant_recruiting AS
SELECT r.id                AS restaurant_id,
       r.name, r.road_address, r.latitude, r.longitude,
       r.food_type_code, ft.label AS food_type_label,
       r.category_name,                                   -- ★ v6 에서 추가
       r.rating, r.review_count, r.place_url,
       COUNT(mr.id)                    AS recruiting_count,
       (COUNT(mr.id) >= 3)             AS is_popular       -- 인기 배지 기준: 모집 3명 이상
FROM restaurant r
JOIN food_type_code ft ON ft.code = r.food_type_code
LEFT JOIN matching_request mr
       ON mr.restaurant_id = r.id
      AND mr.matching_type = 'MAP'
      AND mr.status = 'SEARCHING'
WHERE r.is_active = TRUE
GROUP BY r.id;
