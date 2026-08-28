-- =====================================================================
--  v9 패치 — 밥친구 평가(match_rating) 테이블 추가
--
--  실행 : cd server && npm run db:patch9      (몇 번 돌려도 안전)
--         새 DB 는 docker-entrypoint-initdb.d 로 자동 적용된다.
--
--  왜 필요한가
--    채팅 "..." 메뉴의 "밥친구 평가하기" — 식사 후 상대를 5점 척도 +
--    선택 태그로 평가한다. 평가는 상대에게 공개하지 않고(화면 문구 그대로)
--    지금은 저장만 한다 — 매칭 추천 가중치 반영은 별도 작업으로 남겨둔다.
--    한 매칭당 한 사람이 한 번만 평가하도록 유니크 제약을 건다.
-- =====================================================================
USE bapfriend;
SET NAMES utf8mb4;

CREATE TABLE IF NOT EXISTS match_rating (
  id           BIGINT       NOT NULL AUTO_INCREMENT,
  match_id     BIGINT       NOT NULL,
  rater_id     BIGINT       NOT NULL,        -- 평가한 사람
  rated_id     BIGINT       NOT NULL,        -- 평가받은 사람(상대)
  score        TINYINT      NOT NULL,        -- 1 별로였어요 ~ 5 또 만나고 싶어요
  tags         VARCHAR(300) NULL,            -- 선택 태그 코드, 콤마로 이어붙임
  created_at   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_match_rating (match_id, rater_id),
  CONSTRAINT fk_rating_match  FOREIGN KEY (match_id, rater_id) REFERENCES match_participant (match_id, user_id),
  CONSTRAINT fk_rating_rated  FOREIGN KEY (rated_id) REFERENCES users (id),
  CONSTRAINT ck_rating_score  CHECK (score BETWEEN 1 AND 5),
  CONSTRAINT ck_rating_self   CHECK (rater_id <> rated_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
