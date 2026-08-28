/**
 * v18 패치(ck_chat_message_type 에 LOTTERY 추가) 적용 중
 * "Check constraint 'ck_chat_message_type' is violated" 가 나면, 이미 그 제약을
 * 위반하는 행이 있다는 뜻이다(제약을 다시 걸 때 기존 데이터까지 다시 검사된다) —
 * 어떤 행인지 찾아서 보여준다.
 *
 *   node scripts/find-bad-chat-types.js
 */
import 'dotenv/config';
import mysql from 'mysql2/promise';

async function main() {
  const pool = await mysql.createPool({
    host: process.env.DB_HOST, port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER, password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME, charset: 'utf8mb4',
  });
  try {
    const [rows] = await pool.query(
      `SELECT id, match_id, sender_id, message_type, content, sent_at
         FROM chat_message
        WHERE message_type NOT IN ('TEXT','SYSTEM','MEETING','RESTAURANT','LOTTERY')`);
    if (!rows.length) {
      console.log('제약을 위반하는 행이 없어요 — 다른 원인일 수 있어요.');
    } else {
      console.log(`제약 위반 행 ${rows.length}개:`);
      console.table(rows);
    }
  } finally {
    await pool.end();
  }
}

main().catch((e) => {
  console.error('실행 실패: ' + e.message);
  process.exit(1);
});
