-- =====================================================================
--  v14 패치 — 잡은 약속(식당/시간) 취소 허용
--
--  실행 : cd server && npm run db:patch14      (몇 번 돌려도 안전 — 트리거 재정의)
--
--  왜 필요한가
--    채팅 "+"로 약속(식당+날짜/시간)을 잡으면 meal_match.status 가
--    CONFIRMED → SCHEDULED 로 바뀌는데, 마음이 바뀌어 약속만 취소하고
--    매칭(채팅) 자체는 계속 이어가고 싶을 수 있다. 기존 트리거
--    trg_match_transition 은 SCHEDULED 에서 나갈 수 있는 곳이
--    COMPLETED/CANCELLED 뿐이라 "약속만 취소하고 CONFIRMED로 되돌리기"가
--    막혀 있었다 — SCHEDULED → CONFIRMED 를 허용한다.
-- =====================================================================
USE bapfriend;
SET NAMES utf8mb4;

DROP TRIGGER IF EXISTS trg_match_transition;

DELIMITER $$
CREATE TRIGGER trg_match_transition BEFORE UPDATE ON meal_match FOR EACH ROW
BEGIN
  DECLARE msg VARCHAR(200);
  IF OLD.status <> NEW.status THEN
    IF NOT ( (OLD.status = 'CONFIRMED' AND NEW.status IN ('SCHEDULED','CANCELLED'))
          OR (OLD.status = 'SCHEDULED' AND NEW.status IN ('CONFIRMED','COMPLETED','CANCELLED')) ) THEN
      SET msg = CONCAT_WS('', 'meal_match ', OLD.id, ': invalid transition ', OLD.status, ' -> ', NEW.status);
      SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = msg;
    END IF;
  END IF;
END$$
DELIMITER ;
