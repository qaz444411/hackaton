-- ===================================================================
-- v5: 채팅 개선
--   · AI 추천 질문에 최근 대화 일부를 참고할지 사용자별로 켜고 끌 수 있게
--     (기본값 OFF — 명시적으로 켜야만 대화 일부가 제미나이/Bedrock 으로 나간다)
--   · 채팅방 삭제(내 목록에서만 숨김) — 종료(READ_ONLY)된 대화만 가능
-- 재실행 안전
-- ===================================================================
USE bapfriend;
SET NAMES utf8mb4;

DROP PROCEDURE IF EXISTS sp_v5_patch;

DELIMITER $$
CREATE PROCEDURE sp_v5_patch()
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'user_notification_setting'
       AND COLUMN_NAME = 'ai_context_enabled'
  ) THEN
    ALTER TABLE user_notification_setting
      ADD COLUMN ai_context_enabled BOOLEAN NOT NULL DEFAULT FALSE AFTER marketing;
  END IF;
END$$
DELIMITER ;

CALL sp_v5_patch();
DROP PROCEDURE sp_v5_patch;

-- 채팅방 삭제 = 실제 삭제가 아니라 "나에게서만" 목록에서 숨김.
-- 메시지/상대방 쪽 기록은 그대로 남는다(감사 로그 취지 유지).
-- OPEN 인 방은 숨겨도 상대가 계속 메시지를 보낼 수 있어 다시 나타나야 하므로,
-- 서버에서 READ_ONLY(종료된 대화)에만 허용한다.
CREATE TABLE IF NOT EXISTS chat_room_hidden (
  match_id   BIGINT   NOT NULL,
  user_id    BIGINT   NOT NULL,
  hidden_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (match_id, user_id),
  CONSTRAINT fk_chat_hidden_room FOREIGN KEY (match_id) REFERENCES chat_room (match_id) ON DELETE CASCADE,
  CONSTRAINT fk_chat_hidden_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
