-- =====================================================================
--  v4 패치 — chat_suggested_question.source 에 'BEDROCK' 허용
--
--  실행 : cd server && npm run db:patch4      (몇 번 돌려도 안전)
--         새 DB 는 docker-entrypoint-initdb.d 로 자동 적용된다.
--
--  왜 필요한가
--    v2 의 ck_csq_source CHECK 가 ('GEMINI','FALLBACK') 두 값만 허용한다.
--    AI_PROVIDER=bedrock 으로 추천 질문을 저장하면 이 제약에 걸려
--    INSERT 가 실패한다. 값 목록만 넓힌다.
-- =====================================================================
USE bapfriend;
SET NAMES utf8mb4;

DROP PROCEDURE IF EXISTS sp_v4_patch;

DELIMITER $$
CREATE PROCEDURE sp_v4_patch()
BEGIN
  -- 기존 제약이 있으면 떼어낸다 (재실행 안전)
  IF EXISTS (
    SELECT 1 FROM information_schema.TABLE_CONSTRAINTS
     WHERE CONSTRAINT_SCHEMA = DATABASE()
       AND TABLE_NAME        = 'chat_suggested_question'
       AND CONSTRAINT_NAME   = 'ck_csq_source'
  ) THEN
    ALTER TABLE chat_suggested_question DROP CHECK ck_csq_source;
  END IF;

  ALTER TABLE chat_suggested_question
    ADD CONSTRAINT ck_csq_source CHECK (source IN ('GEMINI','BEDROCK','FALLBACK'));
END$$
DELIMITER ;

CALL sp_v4_patch();
DROP PROCEDURE sp_v4_patch;
