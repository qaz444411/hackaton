-- =====================================================================
--  v13 패치 — 채팅 목록 미리보기에 마지막 메시지 타입 추가
--
--  실행 : cd server && npm run db:patch13      (몇 번 돌려도 안전 — VIEW 재정의)
--
--  왜 필요한가
--    v_chat_list.last_message 는 chat_message.content 원문을 그대로 준다.
--    RESTAURANT/MEETING 타입은 content 가 사람이 읽는 문장이 아니라 JSON
--    카드 데이터라서, 채팅 목록에 {"restaurantId":46,"name":"..."} 같은
--    원문이 그대로 노출됐다. last_message_type 을 같이 내려줘서 프론트가
--    타입별로 "OO 식당을 보냈어요" 처럼 사람이 읽을 문장으로 바꿔 보여준다.
-- =====================================================================
USE bapfriend;
SET NAMES utf8mb4;

CREATE OR REPLACE VIEW v_chat_list AS
SELECT me.user_id,
       cr.match_id,
       cr.status                AS room_status,
       cr.last_message_at,
       ou.id                    AS partner_user_id,
       ou.nickname              AS partner_nickname,
       ou.profile_image         AS partner_image,
       lm.content               AS last_message,
       lm.message_type          AS last_message_type,
       (SELECT COUNT(*) FROM chat_message cm
         WHERE cm.match_id = cr.match_id AND cm.read_at IS NULL
           AND (cm.sender_id IS NULL OR cm.sender_id <> me.user_id))                   AS unread_count
FROM chat_room cr
JOIN match_participant me    ON me.match_id = cr.match_id
JOIN match_participant other ON other.match_id = cr.match_id AND other.user_id <> me.user_id
JOIN users ou                ON ou.id = other.user_id
LEFT JOIN chat_message lm ON lm.id = (
  SELECT cm.id FROM chat_message cm
   WHERE cm.match_id = cr.match_id
   ORDER BY cm.sent_at DESC, cm.id DESC LIMIT 1
);
