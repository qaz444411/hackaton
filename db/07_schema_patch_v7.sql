-- ===================================================================
-- v7: 음식 종류에 '기타(ETC)' 추가
--
--   왜 필요한가
--     카카오 분류에는 술집 / 도시락 / 구내식당 / 야식 / 아시아음식처럼
--     한식·중식·일식·양식 어디에도 안 들어가는 것들이 있다.
--     기존 mapFoodType 은 이런 걸 전부 KOREAN 으로 떨어뜨렸고(224건 중 43건),
--     그 결과 지도의 "한식" 필터에 치킨집과 호프집이 섞여 나왔다.
--
--   왜 ANY 를 쓰지 않는가
--     restaurant 에는 ck_restaurant_food CHECK (food_type_code <> 'ANY') 가 있다.
--     "음식점은 아무거나일 수 없다" 는 의도된 제약이라 우회하지 않고
--     분류용 코드를 정식으로 하나 추가한다.
--
--   is_active = 0 인 이유
--     /api/codes 는 is_active 인 것만 내려준다.
--     '기타' 는 식당을 분류하는 값이지 사용자가 고를 취향이 아니므로,
--     취향 선택 화면(음식 종류 칩)에는 나오지 않게 한다.
--     FK 는 is_active 와 무관하므로 restaurant.food_type_code='ETC' 는 정상 동작한다.
--
-- 재실행 안전 (INSERT ... ON DUPLICATE KEY UPDATE)
-- 실행 : cd server && npm run db:patch7
-- ===================================================================
USE bapfriend;
SET NAMES utf8mb4;

INSERT INTO food_type_code (code, label, sort_order, is_active)
VALUES ('ETC', '기타', 6, 0)
ON DUPLICATE KEY UPDATE label = VALUES(label),
                        sort_order = VALUES(sort_order),
                        is_active = VALUES(is_active);
