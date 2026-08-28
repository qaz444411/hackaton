/**
 * restaurant.food_type_code 재분류 — node scripts/reclassify-food-type.js [--apply]
 *
 * mapFoodType 이 매칭 실패 시 KOREAN 으로 떨어뜨리던 시절에 저장된 데이터를
 * 지금 규칙으로 다시 계산해 고친다. 치킨/패스트푸드/술집 등이 한식으로
 * 섞여 들어가 지도 필터가 어긋나 있었다.
 *
 * 기본은 미리보기(dry-run). --apply 를 줘야 실제로 반영한다.
 *
 * 주의: matching_request 에 복합 FK 가 있다.
 *   fk_mr_restaurant (restaurant_id, food_type_code) → restaurant (id, food_type_code)
 * 그래서 restaurant 를 먼저 바꾸면 참조가 깨진다.
 * 같은 트랜잭션 안에서 FK 검사를 잠시 끄고 restaurant → matching_request 순으로
 * 함께 맞춘 뒤 다시 켠다.
 */
import 'dotenv/config';
import mysql from 'mysql2/promise';
import { mapFoodType } from '../src/services/kakao.service.js';

const APPLY = process.argv.includes('--apply');

const conn = await mysql.createConnection({
  host: process.env.DB_HOST, port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER, password: process.env.DB_PASSWORD, database: process.env.DB_NAME,
});

const [rows] = await conn.query(
  'SELECT id, name, category_name, food_type_code FROM restaurant');

const changes = rows
  .map((r) => ({ ...r, next: mapFoodType(r.category_name || '') }))
  .filter((r) => r.next !== r.food_type_code);

if (!changes.length) {
  console.log('재분류할 음식점이 없습니다. (이미 최신 규칙과 일치)');
  await conn.end();
  process.exit(0);
}

/* 요약 */
const summary = {};
for (const c of changes) {
  const k = `${c.food_type_code} → ${c.next}`;
  summary[k] = (summary[k] || 0) + 1;
}
console.log(`재분류 대상 ${changes.length} / ${rows.length} 건\n`);
console.table(Object.entries(summary).map(([변경, 건수]) => ({ 변경, 건수 })));

/* 참조 중인 matching_request 확인 */
const ids = changes.map((c) => c.id);
const [refs] = await conn.query(
  'SELECT id, restaurant_id, food_type_code, status FROM matching_request WHERE restaurant_id IN (?)',
  [ids]);
console.log(`\n영향받는 matching_request: ${refs.length}건`);
if (refs.length) console.table(refs);

if (!APPLY) {
  console.log('\n미리보기입니다. 실제로 반영하려면 --apply 를 붙이세요.');
  await conn.end();
  process.exit(0);
}

/* 반영 */
await conn.beginTransaction();
try {
  // 복합 FK 때문에 restaurant 와 matching_request 를 동시에 맞춰야 한다.
  await conn.query('SET FOREIGN_KEY_CHECKS = 0');

  let n = 0;
  for (const c of changes) {
    await conn.query('UPDATE restaurant SET food_type_code = ? WHERE id = ?', [c.next, c.id]);
    // 이 식당을 참조하는 매칭 요청의 음식 종류도 같이 맞춘다(복합 FK 일관성)
    const [r] = await conn.query(
      'UPDATE matching_request SET food_type_code = ? WHERE restaurant_id = ?', [c.next, c.id]);
    n += 1;
    if (r.affectedRows) console.log(`  matching_request ${r.affectedRows}건 동기화 (restaurant ${c.id})`);
  }

  await conn.query('SET FOREIGN_KEY_CHECKS = 1');

  // FK 를 다시 켠 상태에서 일관성이 실제로 맞는지 확인한다
  const [[bad]] = await conn.query(`
    SELECT COUNT(*) n FROM matching_request mr
     JOIN restaurant r ON r.id = mr.restaurant_id
    WHERE mr.food_type_code <> r.food_type_code`);
  if (bad.n > 0) throw new Error(`복합 FK 불일치 ${bad.n}건 — 롤백합니다`);

  await conn.commit();
  console.log(`\n반영 완료: ${n}건`);
} catch (e) {
  await conn.rollback();
  await conn.query('SET FOREIGN_KEY_CHECKS = 1');
  console.error('\n실패 — 롤백했습니다:', e.message);
  process.exitCode = 1;
}

/* 결과 분포 */
const [dist] = await conn.query(
  'SELECT food_type_code, COUNT(*) n FROM restaurant GROUP BY 1 ORDER BY n DESC');
console.log('\n재분류 후 분포:');
console.table(dist);

await conn.end();
