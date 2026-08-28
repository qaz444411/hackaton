-- =====================================================================
--  v8 패치 — chat_message.message_type 에 'RESTAURANT' 허용
--
--  실행 : cd server && npm run db:patch8      (몇 번 돌려도 안전)
--         새 DB 는 docker-entrypoint-initdb.d 로 자동 적용된다.
--
--  왜 필요한가
--    채팅방 "+" 버튼의 "식당 보내기" 는 음식점 카드를 메시지로 남긴다.
--    "약속 잡기" 는 이미 있던 MEETING 타입을 그대로 쓰지만, 식당 카드는
--    별도 타입이 없으면 TEXT 로 남아 프론트가 카드 UI 로 구분해 그릴 수 없다.
--    content(VARCHAR(500)) 에는 JSON(restaurantId/name/image/dist 등)을 넣는다.
-- =====================================================================
USE bapfriend;
SET NAMES utf8mb4;

DROP PROCEDURE IF EXISTS sp_v8_patch;

DELIMITER $$
CREATE PROCEDURE sp_v8_patch()
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.TABLE_CONSTRAINTS
     WHERE CONSTRAINT_SCHEMA = DATABASE()
       AND TABLE_NAME        = 'chat_message'
       AND CONSTRAINT_NAME   = 'ck_chat_message_type'
  ) THEN
    ALTER TABLE chat_message DROP CHECK ck_chat_message_type;
  END IF;

  ALTER TABLE chat_message
    ADD CONSTRAINT ck_chat_message_type CHECK (message_type IN ('TEXT','SYSTEM','MEETING','RESTAURANT'));
END$$
DELIMITER ;

CALL sp_v8_patch();
DROP PROCEDURE sp_v8_patch;
