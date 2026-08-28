/**
 * 스키마 적용 상태 점검 — node scripts/check-schema.js
 * v1 / v2 / v3 가 제대로 올라갔는지 실측으로 확인한다.
 */
import 'dotenv/config';
import mysql from 'mysql2/promise';

const conn = await mysql.createConnection({
  host: process.env.DB_HOST, port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER, password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
});

const [rows] = await conn.query(`
  SELECT 'v1 users'              AS 항목, COUNT(*) AS 있음 FROM information_schema.tables      WHERE table_schema=DATABASE() AND table_name='users'
  UNION ALL SELECT 'v2 region_code',        COUNT(*) FROM information_schema.tables      WHERE table_schema=DATABASE() AND table_name='region_code'
  UNION ALL SELECT 'v2 v_restaurant_recruiting', COUNT(*) FROM information_schema.views  WHERE table_schema=DATABASE() AND table_name='v_restaurant_recruiting'
  UNION ALL SELECT 'v3 map_spot',           COUNT(*) FROM information_schema.tables      WHERE table_schema=DATABASE() AND table_name='map_spot'
  UNION ALL SELECT 'v3 matching_request.spot_id', COUNT(*) FROM information_schema.columns WHERE table_schema=DATABASE() AND table_name='matching_request' AND column_name='spot_id'
  UNION ALL SELECT 'v3 meal_match.spot_id', COUNT(*) FROM information_schema.columns     WHERE table_schema=DATABASE() AND table_name='meal_match' AND column_name='spot_id'
  UNION ALL SELECT 'v3 v_spot_recruiting',  COUNT(*) FROM information_schema.views       WHERE table_schema=DATABASE() AND table_name='v_spot_recruiting'
  UNION ALL SELECT 'v3 v_spot_buddy',       COUNT(*) FROM information_schema.views       WHERE table_schema=DATABASE() AND table_name='v_spot_buddy'
  UNION ALL SELECT 'v3 fk_mr_spot',         COUNT(*) FROM information_schema.table_constraints WHERE constraint_schema=DATABASE() AND table_name='matching_request' AND constraint_name='fk_mr_spot'
`);
console.table(rows);

for (const name of ['ck_mr_type', 'ck_mr_spot']) {
  const [[c]] = await conn.query(
    'SELECT CHECK_CLAUSE cc FROM information_schema.check_constraints WHERE constraint_schema=DATABASE() AND constraint_name=?',
    [name]);
  console.log(`${name} = ${c?.cc ?? '(없음)'}`);
}

// 뷰가 실제로 조회되는지 (컬럼 오타/의존성 깨짐 탐지)
for (const v of ['v_restaurant_recruiting', 'v_spot_recruiting', 'v_spot_buddy']) {
  const [[r]] = await conn.query(`SELECT COUNT(*) n FROM ${v}`);
  console.log(`${v} 조회 OK — ${r.n}행`);
}

const [[d]] = await conn.query(`
  SELECT (SELECT COUNT(*) FROM restaurant) restaurants,
         (SELECT COUNT(*) FROM map_spot)   spots,
         (SELECT COUNT(*) FROM users)      users`);
console.log('데이터:', d);

await conn.end();
