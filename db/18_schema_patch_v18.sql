-- =====================================================================
--  v18 패치 — chat_message.message_type 에 'LOTTERY' 허용
--
--  실행 : cd server && npm run db:patch18      (몇 번 돌려도 안전)
--
--  왜 필요한가
--    채팅방 "+" 버튼에 "랜덤 메뉴 복권" 을 추가한다 — 누르면 서버가 메뉴를
--    하나 정해서(둘 다 같은 메시지를 보므로 자동으로 같은 결과) 카드형
--    메시지로 남기고, 프론트는 긁기 전까지만 가려서 보여준다.
--    RESTAURANT 타입을 추가했던 v8 과 같은 패턴이다.
-- =====================================================================
USE bapfriend;
SET NAMES utf8mb4;

DROP PROCEDURE IF EXISTS sp_v18_patch;

DELIMITER $$
CREATE PROCEDURE sp_v18_patch()
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
    ADD CONSTRAINT ck_chat_message_type CHECK (message_type IN ('TEXT','SYSTEM','MEETING','RESTAURANT','LOTTERY'));
END$$
DELIMITER ;

CALL sp_v18_patch();
DROP PROCEDURE sp_v18_patch;
