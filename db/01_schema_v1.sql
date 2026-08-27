-- =====================================================================
--  랜덤 밥친구 DB 스키마 — MySQL 8.0 (8.0.16 이상, 검증: 8.0.46)
--  기준 문서 : 요구사항.cell (홈페이지 · 취향 선택 페이지 · 기본선택페이지 · 매칭 진행 페이지)
--
--  실행 :  mysql -u root -p < 랜덤밥친구_schema_mysql.sql
--          (DELIMITER 를 쓰므로 mysql 클라이언트 / Workbench / DBeaver 에서 실행. DB 이름은 아래 두 줄에서 변경)
--
--  PostgreSQL 판과의 차이
--   · 부분 UNIQUE 인덱스  → 생성 컬럼(활성일 때만 값, 아니면 NULL) + UNIQUE KEY
--   · DEFERRABLE 제약     → 없음. "참여자 정확히 2명"은 sp_accept_proposal 로 한 트랜잭션에 생성 + 삭제 금지 트리거
--   · updated_at 트리거    → ON UPDATE CURRENT_TIMESTAMP
--   · lower(nickname) 인덱스 → utf8mb4_0900_ai_ci 콜레이션이 대소문자 무시 → UNIQUE(nickname)
--   · TIMESTAMPTZ         → DATETIME (앱에서 세션 time_zone 을 '+09:00' 으로 통일)
-- =====================================================================

CREATE DATABASE IF NOT EXISTS bapfriend CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;
USE bapfriend;
SET NAMES utf8mb4;

-- 재실행 시: SET FOREIGN_KEY_CHECKS = 0; DROP TABLE ...; SET FOREIGN_KEY_CHECKS = 1;

-- ---------------------------------------------------------------------
-- §0 공통코드 (도메인 무결성)
-- ---------------------------------------------------------------------
CREATE TABLE food_type_code (                       -- 먹고 싶은 음식
  code        VARCHAR(20) NOT NULL,
  label       VARCHAR(20) NOT NULL,
  sort_order  SMALLINT    NOT NULL,
  is_active   BOOLEAN     NOT NULL DEFAULT TRUE,
  PRIMARY KEY (code),
  UNIQUE KEY uq_food_type_label (label),
  UNIQUE KEY uq_food_type_sort  (sort_order)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
INSERT INTO food_type_code (code, label, sort_order) VALUES
  ('KOREAN','한식',1), ('JAPANESE','일식',2), ('CHINESE','중식',3), ('WESTERN','양식',4), ('ANY','아무거나',5);

CREATE TABLE talk_style_code (                      -- 대화 스타일
  code        VARCHAR(20) NOT NULL,
  label       VARCHAR(20) NOT NULL,
  sort_order  SMALLINT    NOT NULL,
  is_active   BOOLEAN     NOT NULL DEFAULT TRUE,
  PRIMARY KEY (code),
  UNIQUE KEY uq_talk_style_label (label),
  UNIQUE KEY uq_talk_style_sort  (sort_order)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
INSERT INTO talk_style_code (code, label, sort_order) VALUES
  ('QUIET','조용하게',1), ('EASY','편하게',2), ('TALKATIVE','수다스럽게',3);

CREATE TABLE meal_time_code (                       -- 식사 시간대
  code        VARCHAR(20) NOT NULL,
  label       VARCHAR(20) NOT NULL,
  sort_order  SMALLINT    NOT NULL,                 -- "유사한 시간대" 판정: |sort_order 차| <= 1
  start_time  TIME        NOT NULL,
  end_time    TIME        NOT NULL,
  is_active   BOOLEAN     NOT NULL DEFAULT TRUE,
  PRIMARY KEY (code),
  UNIQUE KEY uq_meal_time_label (label),
  UNIQUE KEY uq_meal_time_sort  (sort_order),
  CONSTRAINT ck_meal_time_range CHECK (start_time < end_time)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
INSERT INTO meal_time_code (code, label, sort_order, start_time, end_time) VALUES
  ('BREAKFAST','아침',1,'07:00','10:00'), ('LUNCH','점심',2,'11:00','14:00'), ('DINNER','저녁',3,'17:00','21:00');

CREATE TABLE mbti_code (                            -- MBTI 16종 (축 컬럼은 궁합 계산용)
  code CHAR(4) NOT NULL,
  ei   CHAR(1) NOT NULL,
  sn   CHAR(1) NOT NULL,
  tf   CHAR(1) NOT NULL,
  jp   CHAR(1) NOT NULL,
  PRIMARY KEY (code),
  CONSTRAINT ck_mbti_ei CHECK (ei IN ('E','I')),
  CONSTRAINT ck_mbti_sn CHECK (sn IN ('S','N')),
  CONSTRAINT ck_mbti_tf CHECK (tf IN ('T','F')),
  CONSTRAINT ck_mbti_jp CHECK (jp IN ('J','P')),
  CONSTRAINT ck_mbti_code_composed CHECK (code = CONCAT(ei, sn, tf, jp))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
INSERT INTO mbti_code (code, ei, sn, tf, jp)
SELECT CONCAT(a.ei, b.sn, c.tf, d.jp), a.ei, b.sn, c.tf, d.jp
FROM (SELECT 'E' AS ei UNION ALL SELECT 'I') a
CROSS JOIN (SELECT 'S' AS sn UNION ALL SELECT 'N') b
CROSS JOIN (SELECT 'T' AS tf UNION ALL SELECT 'F') c
CROSS JOIN (SELECT 'J' AS jp UNION ALL SELECT 'P') d;

CREATE TABLE interest (                             -- 관심사 마스터 (초기 목록은 가정)
  id         SMALLINT    NOT NULL AUTO_INCREMENT,
  name       VARCHAR(30) NOT NULL,
  is_active  BOOLEAN     NOT NULL DEFAULT TRUE,
  PRIMARY KEY (id),
  UNIQUE KEY uq_interest_name (name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
INSERT INTO interest (name) VALUES
  ('영화·드라마'),('음악'),('게임'),('운동'),('여행'),('맛집'),
  ('개발·IT'),('취업·진로'),('반려동물'),('책'),('일상'),('학교생활');

-- ---------------------------------------------------------------------
-- §1 회원 · 기본정보   (기본선택페이지, 마이페이지)
-- ---------------------------------------------------------------------
CREATE TABLE users (
  id            BIGINT       NOT NULL AUTO_INCREMENT,
  login_id      VARCHAR(50)  NOT NULL,              -- 시트 미기재: 로그인 방식은 가정
  password_hash VARCHAR(255) NOT NULL,
  nickname      VARCHAR(10)  NOT NULL,
  status        VARCHAR(10)  NOT NULL DEFAULT 'ACTIVE',
  created_at    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  withdrawn_at  DATETIME     NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_users_login_id (login_id),
  UNIQUE KEY uq_users_nickname (nickname),          -- ai_ci 콜레이션 → 'Star' 와 'star' 는 중복
  CONSTRAINT ck_users_nickname  CHECK (CHAR_LENGTH(nickname) BETWEEN 2 AND 10
                                       AND nickname REGEXP '^[가-힣A-Za-z0-9]+$'),
  CONSTRAINT ck_users_status    CHECK (status IN ('ACTIVE','SUSPENDED','WITHDRAWN')),
  CONSTRAINT ck_users_withdrawn CHECK ((status = 'WITHDRAWN') = (withdrawn_at IS NOT NULL))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE user_profile (                         -- 회원가입 완료 시 저장되는 기본 정보 (1:1)
  user_id      BIGINT   NOT NULL,
  mbti_code    CHAR(4)  NOT NULL,
  has_allergy  BOOLEAN  NOT NULL,                   -- 알레르기 있음/없음
  spicy_level  SMALLINT NOT NULL,                   -- 매운맛 1~3
  oily_level   SMALLINT NOT NULL,                   -- 느끼한 맛 1~3
  completed_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,   -- 회원가입 완료 시각
  updated_at   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id),
  CONSTRAINT fk_user_profile_user FOREIGN KEY (user_id)   REFERENCES users (id) ON DELETE CASCADE,
  CONSTRAINT fk_user_profile_mbti FOREIGN KEY (mbti_code) REFERENCES mbti_code (code),
  CONSTRAINT ck_profile_spicy CHECK (spicy_level BETWEEN 1 AND 3),
  CONSTRAINT ck_profile_oily  CHECK (oily_level  BETWEEN 1 AND 3)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE user_interest (                        -- 관심사 최대 3개: slot 1~3 + PK(user_id, slot)
  user_id     BIGINT   NOT NULL,
  slot        SMALLINT NOT NULL,
  interest_id SMALLINT NOT NULL,
  PRIMARY KEY (user_id, slot),
  UNIQUE KEY uq_user_interest_item (user_id, interest_id),          -- 같은 관심사 중복 금지
  CONSTRAINT fk_user_interest_profile  FOREIGN KEY (user_id)     REFERENCES user_profile (user_id) ON DELETE CASCADE,
  CONSTRAINT fk_user_interest_interest FOREIGN KEY (interest_id) REFERENCES interest (id),
  CONSTRAINT ck_user_interest_slot CHECK (slot BETWEEN 1 AND 3)     -- 4개째는 물리적으로 불가
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- ---------------------------------------------------------------------
-- §2 음식점 (지도 기반 매칭, 약속 장소)
-- ---------------------------------------------------------------------
CREATE TABLE restaurant (
  id                BIGINT       NOT NULL AUTO_INCREMENT,
  external_place_id VARCHAR(64)  NULL,              -- 지도 API(카카오 등) place id
  name              VARCHAR(100) NOT NULL,
  road_address      VARCHAR(200) NULL,
  latitude          DECIMAL(9,6) NOT NULL,
  longitude         DECIMAL(9,6) NOT NULL,
  food_type_code    VARCHAR(20)  NOT NULL,
  is_active         BOOLEAN      NOT NULL DEFAULT TRUE,
  created_at        DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_restaurant_external (external_place_id),
  UNIQUE KEY uq_restaurant_id_food  (id, food_type_code),           -- 복합 FK 참조용
  CONSTRAINT fk_restaurant_food FOREIGN KEY (food_type_code) REFERENCES food_type_code (code),
  CONSTRAINT ck_restaurant_lat  CHECK (latitude  BETWEEN -90  AND 90),
  CONSTRAINT ck_restaurant_lng  CHECK (longitude BETWEEN -180 AND 180),
  CONSTRAINT ck_restaurant_food CHECK (food_type_code <> 'ANY')      -- 음식점은 '아무거나'일 수 없음
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- ---------------------------------------------------------------------
-- §3 매칭 조건 · 진행   (취향 선택 페이지, 매칭 진행 페이지)
--    한 행 = "이번 매칭"의 조건 + 진행 상태
--    DRAFT(임시 저장) → SEARCHING(매칭 시작) → CONFIRMED / CANCELLED / EXPIRED
-- ---------------------------------------------------------------------
CREATE TABLE matching_request (
  id              BIGINT      NOT NULL AUTO_INCREMENT,
  user_id         BIGINT      NOT NULL,
  matching_type   VARCHAR(10) NOT NULL,             -- RANDOM(랜덤 매칭) / MAP(지도 기반)
  restaurant_id   BIGINT      NULL,                 -- MAP 일 때만 값
  food_type_code  VARCHAR(20) NOT NULL,
  talk_style_code VARCHAR(20) NOT NULL,
  meal_time_code  VARCHAR(20) NOT NULL,
  price_min       INT         NOT NULL,             -- 원 단위, 1만원 배수
  price_max       INT         NOT NULL,
  status          VARCHAR(10) NOT NULL DEFAULT 'DRAFT',
  created_at      DATETIME    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  started_at      DATETIME    NULL,                 -- 매칭 시작 시각
  ended_at        DATETIME    NULL,                 -- 종료(확정/취소/만료) 시각
  -- 사용자당 임시 저장/진행 중 매칭 1건: 활성일 때만 user_id, 아니면 NULL → UNIQUE (NULL 은 중복 허용)
  active_user_id  BIGINT GENERATED ALWAYS AS (CASE WHEN status IN ('DRAFT','SEARCHING') THEN user_id END) VIRTUAL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_matching_request_id_user (id, user_id),             -- 복합 FK 참조용
  UNIQUE KEY uq_matching_request_active  (active_user_id),
  KEY ix_matching_request_search (status, meal_time_code, food_type_code, talk_style_code),   -- 후보 탐색용
  CONSTRAINT fk_mr_user       FOREIGN KEY (user_id)         REFERENCES users (id),
  CONSTRAINT fk_mr_food       FOREIGN KEY (food_type_code)  REFERENCES food_type_code (code),
  CONSTRAINT fk_mr_talk       FOREIGN KEY (talk_style_code) REFERENCES talk_style_code (code),
  CONSTRAINT fk_mr_meal       FOREIGN KEY (meal_time_code)  REFERENCES meal_time_code (code),
  CONSTRAINT fk_mr_restaurant FOREIGN KEY (restaurant_id, food_type_code)
      REFERENCES restaurant (id, food_type_code),   -- 지도 매칭: 음식 종류 = 음식점 종류 (RANDOM 은 NULL 이라 검사 생략)
  CONSTRAINT ck_mr_type        CHECK (matching_type IN ('RANDOM','MAP')),
  CONSTRAINT ck_mr_map         CHECK ((matching_type = 'MAP') = (restaurant_id IS NOT NULL)),
  CONSTRAINT ck_mr_status      CHECK (status IN ('DRAFT','SEARCHING','CONFIRMED','CANCELLED','EXPIRED')),
  CONSTRAINT ck_mr_price_unit  CHECK (price_min % 10000 = 0 AND price_max % 10000 = 0),
  CONSTRAINT ck_mr_price_range CHECK (price_min >= 0 AND price_max <= 100000 AND price_min <= price_max),
  CONSTRAINT ck_mr_started     CHECK (status IN ('DRAFT','CANCELLED') OR started_at IS NOT NULL),
  CONSTRAINT ck_mr_draft       CHECK (status <> 'DRAFT' OR started_at IS NULL),
  CONSTRAINT ck_mr_ended       CHECK ((status IN ('CONFIRMED','CANCELLED','EXPIRED')) = (ended_at IS NOT NULL)),
  CONSTRAINT ck_mr_time_order  CHECK ((started_at IS NULL OR started_at >= created_at)
                                      AND (ended_at IS NULL OR ended_at >= COALESCE(started_at, created_at)))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE matching_status_history (              -- 진행 상태 표시 · 감사 로그 (트리거로 자동 기록)
  id                  BIGINT      NOT NULL AUTO_INCREMENT,
  matching_request_id BIGINT      NOT NULL,
  from_status         VARCHAR(10) NULL,
  to_status           VARCHAR(10) NOT NULL,
  changed_at          DATETIME    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  reason              VARCHAR(100) NULL,
  PRIMARY KEY (id),
  KEY ix_msh_request (matching_request_id, changed_at),
  CONSTRAINT fk_msh_request FOREIGN KEY (matching_request_id) REFERENCES matching_request (id) ON DELETE CASCADE,
  CONSTRAINT ck_msh_from CHECK (from_status IS NULL OR from_status IN ('DRAFT','SEARCHING','CONFIRMED','CANCELLED','EXPIRED')),
  CONSTRAINT ck_msh_to   CHECK (to_status IN ('DRAFT','SEARCHING','CONFIRMED','CANCELLED','EXPIRED'))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- ---------------------------------------------------------------------
-- §4 매칭 요청(보관함) · 확정 매칭(매칭현황)
-- ---------------------------------------------------------------------
CREATE TABLE match_proposal (                       -- 보관함에 들어오는 매칭 요청
  id                   BIGINT      NOT NULL AUTO_INCREMENT,
  requester_request_id BIGINT      NOT NULL,        -- 요청자의 matching_request
  requester_user_id    BIGINT      NOT NULL,        -- 중복 저장이지만 복합 FK로 일관성 보장
  receiver_user_id     BIGINT      NOT NULL,
  receiver_request_id  BIGINT      NULL,            -- 수신자도 매칭 진행 중이면 그 요청
  status               VARCHAR(10) NOT NULL DEFAULT 'PENDING',
  created_at           DATETIME    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  expires_at           DATETIME    NOT NULL,
  responded_at         DATETIME    NULL,
  -- 한 매칭 요청은 동시에 한 명에게만 제안 중: PENDING 일 때만 값 → UNIQUE
  pending_request_id   BIGINT GENERATED ALWAYS AS (CASE WHEN status = 'PENDING' THEN requester_request_id END) VIRTUAL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_proposal_id_status (id, status),                    -- 복합 FK 참조용
  UNIQUE KEY uq_proposal_pair (requester_request_id, receiver_user_id),   -- 같은 요청→같은 상대 1회
  UNIQUE KEY uq_proposal_pending_per_request (pending_request_id),
  KEY ix_proposal_inbox (receiver_user_id, status, created_at),     -- 보관함 조회
  CONSTRAINT fk_proposal_receiver_user FOREIGN KEY (receiver_user_id) REFERENCES users (id),
  CONSTRAINT fk_proposal_requester FOREIGN KEY (requester_request_id, requester_user_id)
      REFERENCES matching_request (id, user_id),
  CONSTRAINT fk_proposal_receiver  FOREIGN KEY (receiver_request_id, receiver_user_id)
      REFERENCES matching_request (id, user_id),    -- receiver_request_id NULL 이면 검사 생략
  CONSTRAINT ck_proposal_self      CHECK (requester_user_id <> receiver_user_id),   -- 자기 자신 금지
  CONSTRAINT ck_proposal_status    CHECK (status IN ('PENDING','ACCEPTED','DECLINED','EXPIRED','CANCELLED')),
  CONSTRAINT ck_proposal_expiry    CHECK (expires_at > created_at),
  CONSTRAINT ck_proposal_responded CHECK ((status IN ('ACCEPTED','DECLINED')) = (responded_at IS NOT NULL))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE meal_match (                           -- 확정된 밥친구 약속
  id              BIGINT      NOT NULL AUTO_INCREMENT,
  proposal_id     BIGINT      NOT NULL,
  proposal_status VARCHAR(10) NOT NULL DEFAULT 'ACCEPTED',   -- 항상 'ACCEPTED' (복합 FK 로 수락된 제안만 참조)
  food_type_code  VARCHAR(20) NOT NULL,
  meal_time_code  VARCHAR(20) NOT NULL,
  restaurant_id   BIGINT      NULL,                 -- 지도 매칭은 즉시, 랜덤 매칭은 채팅에서 확정
  meal_date       DATE        NULL,
  status          VARCHAR(10) NOT NULL DEFAULT 'CONFIRMED',
  confirmed_at    DATETIME    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  completed_at    DATETIME    NULL,
  cancelled_at    DATETIME    NULL,
  cancelled_by    BIGINT      NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_match_proposal (proposal_id),                       -- 제안 1건 = 매칭 1건
  CONSTRAINT fk_match_proposal FOREIGN KEY (proposal_id, proposal_status)
      REFERENCES match_proposal (id, status),
  CONSTRAINT fk_match_food       FOREIGN KEY (food_type_code) REFERENCES food_type_code (code),
  CONSTRAINT fk_match_meal       FOREIGN KEY (meal_time_code) REFERENCES meal_time_code (code),
  CONSTRAINT fk_match_restaurant FOREIGN KEY (restaurant_id)  REFERENCES restaurant (id),
  CONSTRAINT ck_match_proposal_status CHECK (proposal_status = 'ACCEPTED'),
  CONSTRAINT ck_match_status          CHECK (status IN ('CONFIRMED','SCHEDULED','COMPLETED','CANCELLED')),
  CONSTRAINT ck_match_scheduled       CHECK (status NOT IN ('SCHEDULED','COMPLETED')
                                             OR (meal_date IS NOT NULL AND restaurant_id IS NOT NULL)),
  CONSTRAINT ck_match_completed       CHECK ((status = 'COMPLETED') = (completed_at IS NOT NULL)),
  CONSTRAINT ck_match_cancelled       CHECK ((status = 'CANCELLED') = (cancelled_at IS NOT NULL AND cancelled_by IS NOT NULL))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE match_participant (                    -- 매칭당 정확히 2명 (요청자 1 + 수신자 1)
  match_id BIGINT      NOT NULL,
  user_id  BIGINT      NOT NULL,
  role     VARCHAR(10) NOT NULL,
  PRIMARY KEY (match_id, user_id),
  UNIQUE KEY uq_match_participant_role (match_id, role),            -- 역할당 1명 → 최대 2명
  KEY ix_match_participant_user (user_id),
  CONSTRAINT fk_participant_match FOREIGN KEY (match_id) REFERENCES meal_match (id) ON DELETE CASCADE,
  CONSTRAINT fk_participant_user  FOREIGN KEY (user_id)  REFERENCES users (id),
  CONSTRAINT ck_match_participant_role CHECK (role IN ('REQUESTER','RECEIVER'))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- 취소자는 반드시 참여자 (순환 FK, cancelled_by NULL 이면 검사 생략)
ALTER TABLE meal_match ADD CONSTRAINT fk_match_cancelled_by
  FOREIGN KEY (id, cancelled_by) REFERENCES match_participant (match_id, user_id);

-- ---------------------------------------------------------------------
-- §5 채팅
-- ---------------------------------------------------------------------
CREATE TABLE chat_room (                            -- 확정 매칭 1건 = 채팅방 1개 (PK = match_id)
  match_id        BIGINT      NOT NULL,
  status          VARCHAR(10) NOT NULL DEFAULT 'OPEN',
  created_at      DATETIME    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_message_at DATETIME    NULL,
  PRIMARY KEY (match_id),
  CONSTRAINT fk_chat_room_match FOREIGN KEY (match_id) REFERENCES meal_match (id) ON DELETE CASCADE,
  CONSTRAINT ck_chat_room_status CHECK (status IN ('OPEN','READ_ONLY','CLOSED'))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE chat_message (
  id           BIGINT       NOT NULL AUTO_INCREMENT,
  match_id     BIGINT       NOT NULL,
  sender_id    BIGINT       NULL,                   -- SYSTEM 메시지는 NULL
  message_type VARCHAR(10)  NOT NULL DEFAULT 'TEXT',
  content      VARCHAR(500) NOT NULL,
  sent_at      DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  read_at      DATETIME     NULL,
  PRIMARY KEY (id),
  KEY ix_chat_message_room (match_id, sent_at, id),
  CONSTRAINT fk_chat_message_room   FOREIGN KEY (match_id) REFERENCES chat_room (match_id) ON DELETE CASCADE,
  CONSTRAINT fk_chat_message_sender FOREIGN KEY (match_id, sender_id)
      REFERENCES match_participant (match_id, user_id),            -- 참여자만 발신 가능
  CONSTRAINT ck_chat_message_type   CHECK (message_type IN ('TEXT','SYSTEM','MEETING')),
  CONSTRAINT ck_chat_message_sender CHECK ((message_type = 'SYSTEM') = (sender_id IS NULL)),
  CONSTRAINT ck_chat_message_len    CHECK (CHAR_LENGTH(content) BETWEEN 1 AND 500),
  CONSTRAINT ck_chat_message_read   CHECK (read_at IS NULL OR read_at >= sent_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- ---------------------------------------------------------------------
-- §6 홈 화면용 뷰: 사용자별 현재 확정 매칭 (상대방 + 약속 정보)
-- ---------------------------------------------------------------------
CREATE VIEW v_home_confirmed_match AS
SELECT me.user_id,
       m.id             AS match_id,
       m.status,
       m.meal_date,
       mt.label         AS meal_time,
       ft.label         AS food_type,
       r.name           AS restaurant_name,
       other.user_id    AS partner_user_id,
       u.nickname       AS partner_nickname,
       p.mbti_code      AS partner_mbti
FROM meal_match m
JOIN match_participant me    ON me.match_id = m.id
JOIN match_participant other ON other.match_id = m.id AND other.user_id <> me.user_id
JOIN users u                 ON u.id = other.user_id
LEFT JOIN user_profile p     ON p.user_id = other.user_id
JOIN meal_time_code mt       ON mt.code = m.meal_time_code
JOIN food_type_code ft       ON ft.code = m.food_type_code
LEFT JOIN restaurant r       ON r.id = m.restaurant_id
WHERE m.status IN ('CONFIRMED','SCHEDULED');

-- ---------------------------------------------------------------------
-- §7 선언으로 표현할 수 없는 업무 규칙 → 트리거
-- ---------------------------------------------------------------------
DELIMITER $$

-- T1. 매칭 조건 상태 전이 검증: DRAFT→SEARCHING|CANCELLED, SEARCHING→CONFIRMED|CANCELLED|EXPIRED, 종료 상태는 불변
CREATE TRIGGER trg_mr_transition BEFORE UPDATE ON matching_request FOR EACH ROW
BEGIN
  DECLARE msg VARCHAR(200);
  IF OLD.status <> NEW.status THEN
    IF NOT ( (OLD.status = 'DRAFT'     AND NEW.status IN ('SEARCHING','CANCELLED'))
          OR (OLD.status = 'SEARCHING' AND NEW.status IN ('CONFIRMED','CANCELLED','EXPIRED')) ) THEN
      SET msg = CONCAT_WS('', 'matching_request ', OLD.id, ': invalid transition ', OLD.status, ' -> ', NEW.status);
      SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = msg;
    END IF;
  END IF;
END$$

-- T2. 매칭 조건 상태 변경 이력 자동 기록 (매칭 진행 표시용)
CREATE TRIGGER trg_mr_status_log_ins AFTER INSERT ON matching_request FOR EACH ROW
BEGIN
  INSERT INTO matching_status_history (matching_request_id, from_status, to_status) VALUES (NEW.id, NULL, NEW.status);
END$$
CREATE TRIGGER trg_mr_status_log_upd AFTER UPDATE ON matching_request FOR EACH ROW
BEGIN
  IF NOT (OLD.status <=> NEW.status) THEN
    INSERT INTO matching_status_history (matching_request_id, from_status, to_status) VALUES (NEW.id, OLD.status, NEW.status);
  END IF;
END$$

-- T3+T4. 제안 상태 전이: PENDING 에서만 변경 가능(종료 상태 불변), 수락은 요청자 요청이 SEARCHING 이고 만료 전일 때만
CREATE TRIGGER trg_proposal_update BEFORE UPDATE ON match_proposal FOR EACH ROW
BEGIN
  DECLARE msg VARCHAR(200);
  DECLARE v_req_status VARCHAR(10);
  IF OLD.status <> NEW.status THEN
    IF OLD.status <> 'PENDING' THEN
      SET msg = CONCAT_WS('', 'match_proposal ', OLD.id, ': status ', OLD.status, ' is final');
      SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = msg;
    END IF;
    IF NEW.status = 'ACCEPTED' THEN
      SELECT status INTO v_req_status FROM matching_request WHERE id = NEW.requester_request_id;
      IF v_req_status IS NULL OR v_req_status <> 'SEARCHING' THEN
        SET msg = CONCAT_WS('', 'match_proposal ', OLD.id, ': requester request is not SEARCHING');
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = msg;
      END IF;
      IF NEW.expires_at < NOW() THEN
        SET msg = CONCAT_WS('', 'match_proposal ', OLD.id, ': already expired');
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = msg;
      END IF;
    END IF;
  END IF;
END$$

-- T5. 참여자는 제안의 요청자(REQUESTER) / 수신자(RECEIVER) 만, 사용자당 진행 중 확정 매칭은 1건 (T6)
CREATE TRIGGER trg_match_participant_ins BEFORE INSERT ON match_participant FOR EACH ROW
BEGIN
  DECLARE msg VARCHAR(200);
  DECLARE v_req BIGINT; DECLARE v_rcv BIGINT; DECLARE v_cnt INT;
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
  SELECT COUNT(*) INTO v_cnt
    FROM match_participant mp JOIN meal_match m ON m.id = mp.match_id
   WHERE mp.user_id = NEW.user_id AND mp.match_id <> NEW.match_id AND m.status IN ('CONFIRMED','SCHEDULED');
  IF v_cnt > 0 THEN
    SET msg = CONCAT_WS('', 'user ', NEW.user_id, ': already has an active match');
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = msg;
  END IF;
END$$

-- T5'. 참여자 행은 수정·삭제 불가 (매칭 삭제 시 CASCADE 는 트리거를 타지 않으므로 허용됨)
CREATE TRIGGER trg_match_participant_upd BEFORE UPDATE ON match_participant FOR EACH ROW
BEGIN
  IF NEW.match_id <> OLD.match_id OR NEW.user_id <> OLD.user_id OR NEW.role <> OLD.role THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'match_participant: rows are immutable';
  END IF;
END$$
CREATE TRIGGER trg_match_participant_del BEFORE DELETE ON match_participant FOR EACH ROW
BEGIN
  SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'match_participant: rows cannot be deleted';
END$$

-- T7. 확정 매칭 상태 전이: CONFIRMED→SCHEDULED|CANCELLED, SCHEDULED→COMPLETED|CANCELLED, 종료 상태 불변
CREATE TRIGGER trg_match_transition BEFORE UPDATE ON meal_match FOR EACH ROW
BEGIN
  DECLARE msg VARCHAR(200);
  IF OLD.status <> NEW.status THEN
    IF NOT ( (OLD.status = 'CONFIRMED' AND NEW.status IN ('SCHEDULED','CANCELLED'))
          OR (OLD.status = 'SCHEDULED' AND NEW.status IN ('COMPLETED','CANCELLED')) ) THEN
      SET msg = CONCAT_WS('', 'meal_match ', OLD.id, ': invalid transition ', OLD.status, ' -> ', NEW.status);
      SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = msg;
    END IF;
  END IF;
END$$

-- T8. 확정 매칭 생성 시 채팅방 자동 생성, 종료 시 채팅방 읽기 전용
CREATE TRIGGER trg_match_chat_room_ins AFTER INSERT ON meal_match FOR EACH ROW
BEGIN
  INSERT INTO chat_room (match_id) VALUES (NEW.id);
END$$
CREATE TRIGGER trg_match_chat_room_upd AFTER UPDATE ON meal_match FOR EACH ROW
BEGIN
  IF NEW.status IN ('COMPLETED','CANCELLED') AND OLD.status NOT IN ('COMPLETED','CANCELLED') THEN
    UPDATE chat_room SET status = 'READ_ONLY' WHERE match_id = NEW.id AND status = 'OPEN';
  END IF;
END$$

-- T9. 읽기 전용/종료 채팅방에는 메시지 불가, 전송 시 last_message_at 갱신
CREATE TRIGGER trg_chat_message_ins_before BEFORE INSERT ON chat_message FOR EACH ROW
BEGIN
  DECLARE msg VARCHAR(200);
  DECLARE v_room_status VARCHAR(10);
  SELECT status INTO v_room_status FROM chat_room WHERE match_id = NEW.match_id;
  IF v_room_status IS NULL OR v_room_status <> 'OPEN' THEN
    SET msg = CONCAT_WS('', 'chat_room ', NEW.match_id, ': not open');
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = msg;
  END IF;
END$$
CREATE TRIGGER trg_chat_message_ins_after AFTER INSERT ON chat_message FOR EACH ROW
BEGIN
  UPDATE chat_room SET last_message_at = NEW.sent_at WHERE match_id = NEW.match_id;
END$$

-- ---------------------------------------------------------------------
-- §8 제안 수락 프로시저: 제안 ACCEPTED → 확정 매칭 + 참여자 2명 + 요청 CONFIRMED 을 한 트랜잭션으로
--     (MySQL 은 커밋 시점 검사가 없으므로 "참여자 정확히 2명"은 이 프로시저로 보장한다.
--      앱은 meal_match / match_participant 에 직접 INSERT 하지 말고 이것만 호출한다.)
--     사용:  CALL sp_accept_proposal(제안ID, @match_id); SELECT @match_id;
-- ---------------------------------------------------------------------
CREATE PROCEDURE sp_accept_proposal (IN p_proposal_id BIGINT, OUT p_match_id BIGINT)
BEGIN
  DECLARE v_req_id   BIGINT;  DECLARE v_req_user BIGINT;  DECLARE v_rcv_user BIGINT;  DECLARE v_rcv_req BIGINT;
  DECLARE v_status   VARCHAR(10);  DECLARE v_expires DATETIME;
  DECLARE v_food     VARCHAR(20);  DECLARE v_meal    VARCHAR(20);  DECLARE v_rest BIGINT;
  DECLARE EXIT HANDLER FOR SQLEXCEPTION BEGIN ROLLBACK; RESIGNAL; END;

  START TRANSACTION;

  SELECT requester_request_id, requester_user_id, receiver_user_id, receiver_request_id, status, expires_at
    INTO v_req_id, v_req_user, v_rcv_user, v_rcv_req, v_status, v_expires
    FROM match_proposal WHERE id = p_proposal_id FOR UPDATE;
  IF v_status IS NULL THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'sp_accept_proposal: proposal not found'; END IF;
  IF v_status <> 'PENDING' THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'sp_accept_proposal: proposal is not PENDING'; END IF;
  IF v_expires < NOW() THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'sp_accept_proposal: proposal expired'; END IF;

  SELECT food_type_code, meal_time_code, restaurant_id INTO v_food, v_meal, v_rest
    FROM matching_request WHERE id = v_req_id AND status = 'SEARCHING' FOR UPDATE;
  IF v_food IS NULL THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'sp_accept_proposal: requester request is not SEARCHING'; END IF;

  UPDATE match_proposal SET status = 'ACCEPTED', responded_at = NOW() WHERE id = p_proposal_id;

  INSERT INTO meal_match (proposal_id, food_type_code, meal_time_code, restaurant_id)
  VALUES (p_proposal_id, v_food, v_meal, v_rest);                    -- 채팅방은 트리거가 생성
  SET p_match_id = LAST_INSERT_ID();

  INSERT INTO match_participant (match_id, user_id, role)
  VALUES (p_match_id, v_req_user, 'REQUESTER'), (p_match_id, v_rcv_user, 'RECEIVER');

  UPDATE matching_request SET status = 'CONFIRMED', ended_at = NOW() WHERE id = v_req_id;
  IF v_rcv_req IS NOT NULL THEN
    UPDATE matching_request SET status = 'CONFIRMED', ended_at = NOW() WHERE id = v_rcv_req AND status = 'SEARCHING';
  END IF;

  -- 두 사람의 다른 PENDING 제안은 정리
  UPDATE match_proposal SET status = 'CANCELLED'
   WHERE status = 'PENDING' AND id <> p_proposal_id
     AND (requester_request_id = v_req_id OR (v_rcv_req IS NOT NULL AND requester_request_id = v_rcv_req)
          OR receiver_user_id IN (v_req_user, v_rcv_user));

  COMMIT;
END$$

-- ---------------------------------------------------------------------
-- §9 만료 배치 (이벤트 스케줄러가 켜져 있을 때만 동작: SET GLOBAL event_scheduler = ON)
-- ---------------------------------------------------------------------
CREATE EVENT IF NOT EXISTS ev_expire_pending
  ON SCHEDULE EVERY 5 MINUTE
  DO BEGIN
    UPDATE match_proposal SET status = 'EXPIRED' WHERE status = 'PENDING' AND expires_at < NOW();
  END$$

DELIMITER ;

-- 선택: 앱 계정에는 확정 매칭 직접 INSERT 권한을 주지 않고 프로시저만 허용
-- GRANT SELECT, INSERT, UPDATE ON bapfriend.* TO 'app'@'%';
-- REVOKE INSERT ON bapfriend.meal_match FROM 'app'@'%';
-- REVOKE INSERT ON bapfriend.match_participant FROM 'app'@'%';
-- GRANT EXECUTE ON PROCEDURE bapfriend.sp_accept_proposal TO 'app'@'%';
