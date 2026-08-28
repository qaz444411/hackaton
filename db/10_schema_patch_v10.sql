-- =====================================================================
--  v10 패치 — 보관함 "알림 삭제" (proposal_hidden) 테이블 추가
--
--  실행 : cd server && npm run db:patch10      (몇 번 돌려도 안전)
--
--  왜 필요한가
--    보관함(v_inbox)은 받은 매칭 요청을 상태 관계없이 전부 영구히 보여준다 —
--    거절/취소/만료된 오래된 항목을 치울 방법이 없었다. chat_room_hidden과
--    같은 패턴으로 "내 목록에서만 숨김"을 추가한다(요청 데이터 자체는
--    남겨서 상대 쪽 기록이나 통계에 영향 없게 한다).
--    대기 중(PENDING)인 요청은 먼저 수락/취소해야 삭제할 수 있다 —
--    이건 서버 라우트에서 막는다(스키마 제약 아님).
-- =====================================================================
USE bapfriend;
SET NAMES utf8mb4;

CREATE TABLE IF NOT EXISTS proposal_hidden (
  proposal_id  BIGINT   NOT NULL,
  user_id      BIGINT   NOT NULL,
  hidden_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (proposal_id, user_id),
  CONSTRAINT fk_proposal_hidden_proposal FOREIGN KEY (proposal_id) REFERENCES match_proposal (id) ON DELETE CASCADE,
  CONSTRAINT fk_proposal_hidden_user     FOREIGN KEY (user_id)     REFERENCES users (id)          ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
