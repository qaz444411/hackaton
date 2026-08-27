-- =====================================================================
--  랜덤 밥친구 — 스키마 업데이트 (v2 패치)
--  전제 : 랜덤밥친구_schema_mysql.sql (v1) 이 이미 적용된 DB
--  실행 : mysql -u root -p bapfriend < 02_schema_patch_v2.sql
--
--  요구사항_최종.pdf 에서 v1 에 없던 항목만 추가한다.
--   ① 회원가입: 이메일 / 나이 / 성별 / 선호 지역 / 프로필 이미지 / 중복확인
--   ② 지도·음식점: 평점, 인기 배지, 카카오 place 좌표 캐시
--   ③ 밥친구 모집(지도 매칭) 현황 조회 뷰
--   ④ 보관함: 읽음 여부 + 신규 건수
--   ⑤ 채팅: 추천 질문(제미나이) 로그, 신고/강제종료
--   ⑥ 마이페이지: 알림 설정, 이용 현황(함께한 밥/만난 밥친구)
--   ⑦ 취향 일치율 계산 함수 fn_taste_match_rate
-- =====================================================================
USE bapfriend;
SET NAMES utf8mb4;

-- ---------------------------------------------------------------------
-- ① 회원가입 확장
-- ---------------------------------------------------------------------
ALTER TABLE users
  ADD COLUMN email          VARCHAR(120) NULL AFTER login_id,
  ADD COLUMN age            SMALLINT     NULL AFTER nickname,
  ADD COLUMN gender         VARCHAR(10)  NULL AFTER age,
  ADD COLUMN region_code    VARCHAR(20)  NULL AFTER gender,
  ADD COLUMN profile_image  VARCHAR(300) NULL AFTER region_code,
  ADD COLUMN signup_step    VARCHAR(10)  NOT NULL DEFAULT 'DONE' AFTER status,
  ADD UNIQUE KEY uq_users_email (email),
  ADD CONSTRAINT ck_users_gender CHECK (gender IS NULL OR gender IN ('MALE','FEMALE')),
  ADD CONSTRAINT ck_users_age    CHECK (age IS NULL OR age BETWEEN 14 AND 100),
  ADD CONSTRAINT ck_users_step   CHECK (signup_step IN ('ACCOUNT','PROFILE','DONE'));

CREATE TABLE IF NOT EXISTS region_code (        -- 선호 지역
  code       VARCHAR(20) NOT NULL,
  label      VARCHAR(40) NOT NULL,
  sort_order SMALLINT    NOT NULL,
  is_active  BOOLEAN     NOT NULL DEFAULT TRUE,
  PRIMARY KEY (code),
  UNIQUE KEY uq_region_label (label)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
INSERT IGNORE INTO region_code (code, label, sort_order) VALUES
  ('GUNSAN','군산',1),('JEONJU','전주',2),('IKSAN','익산',3),
  ('SEOUL','서울',4),('GYEONGGI','경기',5),('BUSAN','부산',6),('ETC','기타',99);

ALTER TABLE users
  ADD CONSTRAINT fk_users_region FOREIGN KEY (region_code) REFERENCES region_code (code);

-- ---------------------------------------------------------------------
-- ② 음식점 확장 (평점 / 인기 / 카카오 캐시)
-- ---------------------------------------------------------------------
ALTER TABLE restaurant
  ADD COLUMN rating        DECIMAL(2,1) NULL AFTER food_type_code,     -- 0.0 ~ 5.0
  ADD COLUMN review_count  INT          NOT NULL DEFAULT 0 AFTER rating,
  ADD COLUMN category_name VARCHAR(80)  NULL AFTER review_count,       -- 카카오 category_name 원문
  ADD COLUMN phone         VARCHAR(30)  NULL AFTER category_name,
  ADD COLUMN place_url     VARCHAR(300) NULL AFTER phone,
  ADD COLUMN synced_at     DATETIME     NULL AFTER place_url,          -- 카카오 동기화 시각
  ADD CONSTRAINT ck_restaurant_rating CHECK (rating IS NULL OR rating BETWEEN 0 AND 5);

-- 좌표 반경 검색용 (지도 화면 bounds 조회)
CREATE INDEX ix_restaurant_geo ON restaurant (latitude, longitude, is_active);

-- ---------------------------------------------------------------------
-- ③ 밥친구 모집 현황 (지도 핀/목록의 "모집 인원", 인기 배지)
--    별도 테이블 없이 matching_request(MAP, SEARCHING) 를 집계한다.
-- ---------------------------------------------------------------------
CREATE OR REPLACE VIEW v_restaurant_recruiting AS
SELECT r.id                AS restaurant_id,
       r.name, r.road_address, r.latitude, r.longitude,
       r.food_type_code, ft.label AS food_type_label,
       r.rating, r.review_count, r.place_url,
       COUNT(mr.id)                    AS recruiting_count,
       (COUNT(mr.id) >= 3)             AS is_popular       -- 인기 배지 기준: 모집 3명 이상
FROM restaurant r
JOIN food_type_code ft ON ft.code = r.food_type_code
LEFT JOIN matching_request mr
       ON mr.restaurant_id = r.id
      AND mr.matching_type = 'MAP'
      AND mr.status = 'SEARCHING'
WHERE r.is_active = TRUE
GROUP BY r.id;

-- 음식점별 밥친구 목록 페이지용
CREATE OR REPLACE VIEW v_restaurant_buddy AS
SELECT mr.restaurant_id,
       mr.id            AS matching_request_id,
       u.id             AS user_id,
       u.nickname, u.age, u.gender, u.profile_image,
       ts.label         AS talk_style,
       mt.label         AS meal_time,
       mr.price_min, mr.price_max,
       p.mbti_code, p.has_allergy, p.spicy_level, p.oily_level
FROM matching_request mr
JOIN users u            ON u.id = mr.user_id AND u.status = 'ACTIVE'
JOIN talk_style_code ts ON ts.code = mr.talk_style_code
JOIN meal_time_code  mt ON mt.code = mr.meal_time_code
LEFT JOIN user_profile p ON p.user_id = u.id
WHERE mr.matching_type = 'MAP' AND mr.status = 'SEARCHING';

-- ---------------------------------------------------------------------
-- ④ 보관함: 읽음 여부 / 신규 건수
-- ---------------------------------------------------------------------
ALTER TABLE match_proposal
  ADD COLUMN read_at DATETIME NULL AFTER responded_at;

CREATE OR REPLACE VIEW v_inbox AS
SELECT p.id                AS proposal_id,
       p.receiver_user_id  AS user_id,
       p.status,
       p.created_at,
       p.expires_at,
       (p.read_at IS NULL) AS is_new,
       ru.id               AS partner_user_id,
       ru.nickname         AS partner_nickname,
       ru.age              AS partner_age,
       ru.profile_image    AS partner_image,
       mt.label            AS meal_time,
       ft.label            AS food_type,
       r.name              AS restaurant_name
FROM match_proposal p
JOIN users ru            ON ru.id = p.requester_user_id
JOIN matching_request mr ON mr.id = p.requester_request_id
JOIN meal_time_code mt   ON mt.code = mr.meal_time_code
JOIN food_type_code ft   ON ft.code = mr.food_type_code
LEFT JOIN restaurant r   ON r.id = mr.restaurant_id;

-- ---------------------------------------------------------------------
-- ⑤ 채팅: 추천 질문(제미나이) / 신고 / 강제 종료
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS chat_suggested_question (
  id           BIGINT       NOT NULL AUTO_INCREMENT,
  match_id     BIGINT       NOT NULL,
  question     VARCHAR(200) NOT NULL,
  source       VARCHAR(20)  NOT NULL DEFAULT 'GEMINI',   -- GEMINI / FALLBACK
  used_at      DATETIME     NULL,                        -- '입력창에 넣기' 클릭 시각
  created_at   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY ix_csq_match (match_id, created_at),
  CONSTRAINT fk_csq_match FOREIGN KEY (match_id) REFERENCES chat_room (match_id) ON DELETE CASCADE,
  CONSTRAINT ck_csq_source CHECK (source IN ('GEMINI','FALLBACK'))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS user_report (
  id            BIGINT       NOT NULL AUTO_INCREMENT,
  match_id      BIGINT       NOT NULL,
  reporter_id   BIGINT       NOT NULL,
  reported_id   BIGINT       NOT NULL,
  reason_code   VARCHAR(30)  NOT NULL,
  detail        VARCHAR(300) NULL,
  created_at    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_report_once (match_id, reporter_id),
  CONSTRAINT fk_report_match    FOREIGN KEY (match_id, reporter_id) REFERENCES match_participant (match_id, user_id),
  CONSTRAINT fk_report_reported FOREIGN KEY (reported_id) REFERENCES users (id),
  CONSTRAINT ck_report_self   CHECK (reporter_id <> reported_id),
  CONSTRAINT ck_report_reason CHECK (reason_code IN ('SPAM','ABUSE','SEXUAL','NOSHOW','FRAUD','ETC'))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- ---------------------------------------------------------------------
-- ⑥ 마이페이지: 알림 설정 / 이용 현황
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS user_notification_setting (
  user_id      BIGINT   NOT NULL,
  match_push   BOOLEAN  NOT NULL DEFAULT TRUE,
  chat_push    BOOLEAN  NOT NULL DEFAULT TRUE,
  marketing    BOOLEAN  NOT NULL DEFAULT FALSE,
  updated_at   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id),
  CONSTRAINT fk_notify_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE OR REPLACE VIEW v_user_stats AS
SELECT u.id AS user_id,
       COALESCE(SUM(m.status = 'COMPLETED'), 0)                    AS meal_count,      -- 함께한 밥
       COUNT(DISTINCT CASE WHEN m.status = 'COMPLETED'
                           THEN other.user_id END)                 AS buddy_count      -- 만난 밥친구
FROM users u
LEFT JOIN match_participant me    ON me.user_id  = u.id
LEFT JOIN meal_match m            ON m.id        = me.match_id
LEFT JOIN match_participant other ON other.match_id = m.id AND other.user_id <> u.id
GROUP BY u.id;

-- 채팅 목록 페이지용 (최근 메시지 + 미확인 수)
CREATE OR REPLACE VIEW v_chat_list AS
SELECT me.user_id,
       cr.match_id,
       cr.status                AS room_status,
       cr.last_message_at,
       ou.id                    AS partner_user_id,
       ou.nickname              AS partner_nickname,
       ou.profile_image         AS partner_image,
       (SELECT cm.content FROM chat_message cm
         WHERE cm.match_id = cr.match_id ORDER BY cm.sent_at DESC, cm.id DESC LIMIT 1) AS last_message,
       (SELECT COUNT(*) FROM chat_message cm
         WHERE cm.match_id = cr.match_id AND cm.read_at IS NULL
           AND (cm.sender_id IS NULL OR cm.sender_id <> me.user_id))                   AS unread_count
FROM chat_room cr
JOIN match_participant me    ON me.match_id = cr.match_id
JOIN match_participant other ON other.match_id = cr.match_id AND other.user_id <> me.user_id
JOIN users ou                ON ou.id = other.user_id;

-- ---------------------------------------------------------------------
-- ⑦ 취향 일치율 (0~100)
--    MBTI 4축 25 / 매운맛 / 느끼함 / 관심사 교집합 / 이번 매칭 조건 가중 합산
-- ---------------------------------------------------------------------
DELIMITER $$
DROP FUNCTION IF EXISTS fn_taste_match_rate$$
CREATE FUNCTION fn_taste_match_rate (p_user_a BIGINT, p_user_b BIGINT)
RETURNS SMALLINT
DETERMINISTIC READS SQL DATA
BEGIN
  DECLARE v_mbti  DECIMAL(6,2) DEFAULT 0;   -- 30점
  DECLARE v_taste DECIMAL(6,2) DEFAULT 0;   -- 30점 (매운맛 15 + 느끼함 15)
  DECLARE v_int   DECIMAL(6,2) DEFAULT 0;   -- 25점 (관심사)
  DECLARE v_cond  DECIMAL(6,2) DEFAULT 0;   -- 15점 (이번 매칭 조건)
  DECLARE v_same  INT DEFAULT 0;

  SELECT ((a.mbti_code = b.mbti_code) * 0 +
          (SUBSTRING(a.mbti_code,1,1) = SUBSTRING(b.mbti_code,1,1)) +
          (SUBSTRING(a.mbti_code,2,1) = SUBSTRING(b.mbti_code,2,1)) +
          (SUBSTRING(a.mbti_code,3,1) = SUBSTRING(b.mbti_code,3,1)) +
          (SUBSTRING(a.mbti_code,4,1) = SUBSTRING(b.mbti_code,4,1))) * 7.5,
         (3 - ABS(a.spicy_level - b.spicy_level)) / 3 * 15
       + (3 - ABS(a.oily_level  - b.oily_level )) / 3 * 15
    INTO v_mbti, v_taste
  FROM user_profile a JOIN user_profile b ON b.user_id = p_user_b
  WHERE a.user_id = p_user_a;

  SELECT COUNT(*) INTO v_same
  FROM user_interest ia JOIN user_interest ib
    ON ib.user_id = p_user_b AND ib.interest_id = ia.interest_id
  WHERE ia.user_id = p_user_a;
  SET v_int = LEAST(v_same, 3) / 3 * 25;

  SELECT ((a.food_type_code = b.food_type_code OR 'ANY' IN (a.food_type_code, b.food_type_code)) * 5)
       + ((a.talk_style_code = b.talk_style_code) * 5)
       + ((a.meal_time_code  = b.meal_time_code)  * 3)
       + ((a.price_max >= b.price_min AND b.price_max >= a.price_min) * 2)
    INTO v_cond
  FROM matching_request a JOIN matching_request b
    ON b.user_id = p_user_b AND b.status IN ('DRAFT','SEARCHING')
  WHERE a.user_id = p_user_a AND a.status IN ('DRAFT','SEARCHING')
  LIMIT 1;

  RETURN LEAST(100, ROUND(COALESCE(v_mbti,0) + COALESCE(v_taste,0)
                        + COALESCE(v_int,0)  + COALESCE(v_cond,0)));
END$$

-- 회원 생성 시 알림 설정 기본 행 자동 생성
DROP TRIGGER IF EXISTS trg_users_notify_default$$
CREATE TRIGGER trg_users_notify_default AFTER INSERT ON users FOR EACH ROW
BEGIN
  INSERT INTO user_notification_setting (user_id) VALUES (NEW.id);
END$$
DELIMITER ;
