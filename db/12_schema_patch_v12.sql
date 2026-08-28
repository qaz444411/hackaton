-- =====================================================================
--  v12 패치 — "진짜 랜덤 매칭"(BLIND) 매칭 타입 추가
--
--  실행 : cd server && npm run db:patch12      (몇 번 돌려도 안전)
--
--  왜 필요한가
--    취향 기반 랜덤 매칭(RANDOM)과는 완전히 분리된, 조건 없이 그냥
--    누르면 서로 무작위로 붙는 매칭 모드. matching_type 값만 하나
--    늘리면 되고, food_type/talk_style/meal_time/price 컬럼은 기존
--    NOT NULL 제약을 그대로 두고 서버가 중립값을 채워 넣는다
--    (BLIND는 후보 탐색에서 이 값들을 아예 안 쓰므로 의미는 없다 —
--    다만 CHECK 제약(ck_mr_price_unit 등)은 그대로 지켜야 한다).
-- =====================================================================
USE bapfriend;
SET NAMES utf8mb4;

DROP PROCEDURE IF EXISTS sp_v12_patch;

DELIMITER $$
CREATE PROCEDURE sp_v12_patch()
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.TABLE_CONSTRAINTS
     WHERE CONSTRAINT_SCHEMA = DATABASE()
       AND TABLE_NAME        = 'matching_request'
       AND CONSTRAINT_NAME   = 'ck_mr_type'
  ) THEN
    ALTER TABLE matching_request DROP CHECK ck_mr_type;
  END IF;

  ALTER TABLE matching_request
    ADD CONSTRAINT ck_mr_type CHECK (matching_type IN ('RANDOM','MAP','SPOT','BLIND'));
END$$
DELIMITER ;

CALL sp_v12_patch();
DROP PROCEDURE sp_v12_patch;
