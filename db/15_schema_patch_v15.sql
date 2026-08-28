-- =====================================================================
--  v15 패치 — 사용자당 "확정 매칭 1건" 제한 제거
--
--  실행 : cd server && npm run db:patch15      (몇 번 돌려도 안전 — 트리거 재정의)
--
--  왜 필요한가
--    v1부터 trg_match_participant_ins 는 한 사람이 CONFIRMED/SCHEDULED 상태인
--    매칭을 동시에 두 개 이상 가질 수 없게 막고 있었다(이미 확정 매칭이 있으면
--    새 매칭이 수락되는 순간 이 트리거가 막았다. matching.routes.js 의 /draft,
--    /blind/start 는 그 원시 에러가 늦게 터지지 않도록 앞단에서 미리 막아주던
--    보조 장치였다). 밥친구를 한 명으로 제한할 이유가 없어서(이미 채팅방이 있는
--    상대와 별개로 새로운 밥친구를 계속 찾을 수 있어야 한다) 이 제약을 없앤다.
--    제안자/수신자 검증(라인 하단)은 그대로 유지 — 그건 매칭 무결성이지 인원
--    제한이 아니다.
-- =====================================================================
USE bapfriend;
SET NAMES utf8mb4;

DROP TRIGGER IF EXISTS trg_match_participant_ins;

DELIMITER $$
CREATE TRIGGER trg_match_participant_ins BEFORE INSERT ON match_participant FOR EACH ROW
BEGIN
  DECLARE msg VARCHAR(200);
  DECLARE v_req BIGINT; DECLARE v_rcv BIGINT;
  SELECT p.requester_user_id, p.receiver_user_id INTO v_req, v_rcv
    FROM meal_match m JOIN match_proposal p ON p.id = m.proposal_id WHERE m.id = NEW.match_id;
  IF v_req IS NULL THEN
    SET msg = CONCAT_WS('', 'match_participant: meal_match ', NEW.match_id, ' not found');
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = msg;
  END IF;
  IF NOT ((NEW.user_id = v_req AND NEW.role = 'REQUESTER') OR (NEW.user_id = v_rcv AND NEW.role = 'RECEIVER')) THEN
    SET msg = CONCAT_WS('', 'meal_match ', NEW.match_id, ': participants must be the proposal requester and receiver');
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = msg;
  END IF;
END$$
DELIMITER ;
