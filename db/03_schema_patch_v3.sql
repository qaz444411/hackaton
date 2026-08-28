-- =====================================================================
--  랜덤 밥친구 — v3 패치 : 지도 임의 좌표 마커("여기서 먹고싶어요")
-- ---------------------------------------------------------------------
--  v2(02_schema_patch_v2.sql) 적용 이후에 실행한다.
--
--  01/02 패치와 달리 이 파일은 "몇 번 실행해도 안전"하게 작성돼 있다.
--  (모든 ALTER 를 information_schema 로 존재 여부 검사 후 실행)
--
--  실행:
--    mysql -u root -p bapfriend --default-character-set=utf8mb4 < db/03_schema_patch_v3.sql
--
--  추가되는 개념
--    map_spot            지도 위 임의 지점(식당이 아닌 곳도 가능). "학교 앞", "한강 둔치" 등
--    matching_request    matching_type='SPOT' + spot_id 로 그 지점에서 모집
--    meal_match.spot_id  확정된 약속이 어느 지점이었는지 보존
--
--  기존 흐름과의 관계
--    matching_type='MAP'  → restaurant_id 필수 (기존 그대로, 건드리지 않음)
--    matching_type='SPOT' → spot_id 필수 (신규)
--    matching_type='RANDOM' → 둘 다 NULL (기존 그대로)
-- =====================================================================

-- ---------------------------------------------------------------------
-- ① 지도 임의 지점 테이블
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS map_spot (
  id         BIGINT        NOT NULL AUTO_INCREMENT,
  created_by BIGINT        NOT NULL,                  -- 이 지점을 처음 찍은 사람
  label      VARCHAR(100)  NOT NULL,                  -- "여기서 먹고싶어요" 메모 = 핀 이름
  latitude   DECIMAL(10,7) NOT NULL,
  longitude  DECIMAL(10,7) NOT NULL,
  address    VARCHAR(255)  NULL,                      -- 좌표→주소 역지오코딩 결과(선택)
  is_active  TINYINT(1)    NOT NULL DEFAULT 1,
  created_at DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY ix_map_spot_geo (latitude, longitude),          -- 주변 조회용
  CONSTRAINT fk_map_spot_user FOREIGN KEY (created_by) REFERENCES users (id),
  CONSTRAINT ck_map_spot_lat CHECK (latitude  BETWEEN -90  AND 90),
  CONSTRAINT ck_map_spot_lng CHECK (longitude BETWEEN -180 AND 180)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- ---------------------------------------------------------------------
-- ② 컬럼 / 제약 추가 (재실행 안전)
-- ---------------------------------------------------------------------
DELIMITER $$

DROP PROCEDURE IF EXISTS sp_v3_patch$$
CREATE PROCEDURE sp_v3_patch()
BEGIN
  -- matching_request.spot_id
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                  WHERE table_schema = DATABASE()
                    AND table_name   = 'matching_request'
                    AND column_name  = 'spot_id') THEN
    ALTER TABLE matching_request ADD COLUMN spot_id BIGINT NULL AFTER restaurant_id;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints
                  WHERE constraint_schema = DATABASE()
                    AND table_name        = 'matching_request'
                    AND constraint_name   = 'fk_mr_spot') THEN
    ALTER TABLE matching_request
      ADD CONSTRAINT fk_mr_spot FOREIGN KEY (spot_id) REFERENCES map_spot (id);
  END IF;

  -- matching_type 에 'SPOT' 허용 (기존 CHECK 를 교체)
  IF EXISTS (SELECT 1 FROM information_schema.table_constraints
              WHERE constraint_schema = DATABASE()
                AND table_name        = 'matching_request'
                AND constraint_name   = 'ck_mr_type') THEN
    ALTER TABLE matching_request DROP CHECK ck_mr_type;
  END IF;
  ALTER TABLE matching_request
    ADD CONSTRAINT ck_mr_type CHECK (matching_type IN ('RANDOM','MAP','SPOT'));

  -- SPOT 이면 spot_id 필수, 아니면 NULL
  IF EXISTS (SELECT 1 FROM information_schema.table_constraints
              WHERE constraint_schema = DATABASE()
                AND table_name        = 'matching_request'
                AND constraint_name   = 'ck_mr_spot') THEN
    ALTER TABLE matching_request DROP CHECK ck_mr_spot;
  END IF;
  ALTER TABLE matching_request
    ADD CONSTRAINT ck_mr_spot CHECK ((matching_type = 'SPOT') = (spot_id IS NOT NULL));

  -- meal_match.spot_id (확정된 약속의 지점 보존)
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                  WHERE table_schema = DATABASE()
                    AND table_name   = 'meal_match'
                    AND column_name  = 'spot_id') THEN
    ALTER TABLE meal_match ADD COLUMN spot_id BIGINT NULL AFTER restaurant_id;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints
                  WHERE constraint_schema = DATABASE()
                    AND table_name        = 'meal_match'
                    AND constraint_name   = 'fk_match_spot') THEN
    ALTER TABLE meal_match
      ADD CONSTRAINT fk_match_spot FOREIGN KEY (spot_id) REFERENCES map_spot (id);
  END IF;
END$$

DELIMITER ;

CALL sp_v3_patch();
DROP PROCEDURE sp_v3_patch;

-- ---------------------------------------------------------------------
-- ③ 뷰 — 지도에 뿌릴 스팟 + 모집 인원 (v_restaurant_recruiting 과 같은 모양)
-- ---------------------------------------------------------------------
CREATE OR REPLACE VIEW v_spot_recruiting AS
SELECT s.id                AS spot_id,
       s.label, s.latitude, s.longitude, s.address,
       s.created_by, s.created_at,
       COUNT(mr.id)        AS recruiting_count,
       (COUNT(mr.id) >= 3) AS is_popular          -- 인기 배지 기준: 모집 3명 이상 (식당과 동일)
FROM map_spot s
LEFT JOIN matching_request mr
       ON mr.spot_id       = s.id
      AND mr.matching_type = 'SPOT'
      AND mr.status        = 'SEARCHING'
WHERE s.is_active = TRUE
GROUP BY s.id;

-- 스팟별 밥친구 목록 (v_restaurant_buddy 와 같은 모양)
CREATE OR REPLACE VIEW v_spot_buddy AS
SELECT mr.spot_id,
       mr.id            AS matching_request_id,
       u.id             AS user_id,
       u.nickname, u.age, u.gender, u.profile_image,
       ts.label         AS talk_style,
       mt.label         AS meal_time,
       ft.label         AS food_type,
       mr.price_min, mr.price_max,
       p.mbti_code, p.has_allergy, p.spicy_level, p.oily_level
FROM matching_request mr
JOIN users u            ON u.id   = mr.user_id AND u.status = 'ACTIVE'
JOIN talk_style_code ts ON ts.code = mr.talk_style_code
JOIN meal_time_code  mt ON mt.code = mr.meal_time_code
JOIN food_type_code  ft ON ft.code = mr.food_type_code
LEFT JOIN user_profile p ON p.user_id = u.id
WHERE mr.matching_type = 'SPOT' AND mr.status = 'SEARCHING';

-- ---------------------------------------------------------------------
-- ④ sp_accept_proposal — spot_id 를 meal_match 로 넘기도록 갱신
--     (v1 원본과 로직 동일. spot_id 전달 2줄만 추가)
-- ---------------------------------------------------------------------
DELIMITER $$

DROP PROCEDURE IF EXISTS sp_accept_proposal$$
CREATE PROCEDURE sp_accept_proposal (IN p_proposal_id BIGINT, OUT p_match_id BIGINT)
BEGIN
  DECLARE v_req_id   BIGINT;  DECLARE v_req_user BIGINT;  DECLARE v_rcv_user BIGINT;  DECLARE v_rcv_req BIGINT;
  DECLARE v_status   VARCHAR(10);  DECLARE v_expires DATETIME;
  DECLARE v_food     VARCHAR(20);  DECLARE v_meal    VARCHAR(20);  DECLARE v_rest BIGINT;
  DECLARE v_spot     BIGINT;
  DECLARE EXIT HANDLER FOR SQLEXCEPTION BEGIN ROLLBACK; RESIGNAL; END;

  START TRANSACTION;

  SELECT requester_request_id, requester_user_id, receiver_user_id, receiver_request_id, status, expires_at
    INTO v_req_id, v_req_user, v_rcv_user, v_rcv_req, v_status, v_expires
    FROM match_proposal WHERE id = p_proposal_id FOR UPDATE;
  IF v_status IS NULL THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'sp_accept_proposal: proposal not found'; END IF;
  IF v_status <> 'PENDING' THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'sp_accept_proposal: proposal is not PENDING'; END IF;
  IF v_expires < NOW() THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'sp_accept_proposal: proposal expired'; END IF;

  SELECT food_type_code, meal_time_code, restaurant_id, spot_id
    INTO v_food, v_meal, v_rest, v_spot
    FROM matching_request WHERE id = v_req_id AND status = 'SEARCHING' FOR UPDATE;
  IF v_food IS NULL THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'sp_accept_proposal: requester request is not SEARCHING'; END IF;

  UPDATE match_proposal SET status = 'ACCEPTED', responded_at = NOW() WHERE id = p_proposal_id;

  INSERT INTO meal_match (proposal_id, food_type_code, meal_time_code, restaurant_id, spot_id)
  VALUES (p_proposal_id, v_food, v_meal, v_rest, v_spot);            -- 채팅방은 트리거가 생성
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

DELIMITER ;
