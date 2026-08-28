/**
 * 스모크 테스트가 남긴 데이터만 지운다 — node scripts/clean-smoke.js
 *
 * 대상은 이메일이 smoke...@test.local 인 계정과 거기서 파생된 행뿐이다.
 * 실제 사용자 데이터는 건드리지 않는다.
 */
import 'dotenv/config';
import mysql from 'mysql2/promise';

const conn = await mysql.createConnection({
  host: process.env.DB_HOST, port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER, password: process.env.DB_PASSWORD, database: process.env.DB_NAME,
});

const [users] = await conn.query(
  "SELECT id, email FROM users WHERE email LIKE 'smoke%@test.local'");
if (!users.length) {
  console.log('지울 스모크 계정이 없습니다.');
  await conn.end();
  process.exit(0);
}
const ids = users.map((u) => u.id);
console.log('대상 계정:', users.map((u) => `${u.id}/${u.email}`).join(', '));

const [proposals] = await conn.query(
  'SELECT id FROM match_proposal WHERE requester_user_id IN (?) OR receiver_user_id IN (?)', [ids, ids]);
const pIds = proposals.map((p) => p.id);

const [matches] = pIds.length
  ? await conn.query('SELECT id FROM meal_match WHERE proposal_id IN (?)', [pIds])
  : [[]];
const mIds = matches.map((m) => m.id);

const [requests] = await conn.query('SELECT id FROM matching_request WHERE user_id IN (?)', [ids]);
const rIds = requests.map((r) => r.id);

const run = async (label, sql, params) => {
  const [res] = await conn.query(sql, params);
  console.log(`  ${label}: ${res.affectedRows}행`);
};

if (mIds.length) {
  await run('chat_message', 'DELETE FROM chat_message WHERE match_id IN (?)', [mIds]);
  // meal_match 삭제 → chat_room / match_participant 는 CASCADE 로 함께 삭제 (트리거 우회)
  await run('meal_match(+chat_room,participant)', 'DELETE FROM meal_match WHERE id IN (?)', [mIds]);
}
if (pIds.length) await run('match_proposal', 'DELETE FROM match_proposal WHERE id IN (?)', [pIds]);
if (rIds.length) {
  await run('matching_status_history', 'DELETE FROM matching_status_history WHERE matching_request_id IN (?)', [rIds]);
  await run('matching_request', 'DELETE FROM matching_request WHERE id IN (?)', [rIds]);
}
await run('map_spot', 'DELETE FROM map_spot WHERE created_by IN (?)', [ids]);
await run('user_interest', 'DELETE FROM user_interest WHERE user_id IN (?)', [ids]);
await run('user_profile', 'DELETE FROM user_profile WHERE user_id IN (?)', [ids]);
await run('users', 'DELETE FROM users WHERE id IN (?)', [ids]);

const [[left]] = await conn.query(`
  SELECT (SELECT COUNT(*) FROM users) users, (SELECT COUNT(*) FROM map_spot) spots,
         (SELECT COUNT(*) FROM meal_match) matches, (SELECT COUNT(*) FROM match_participant) participants,
         (SELECT COUNT(*) FROM matching_request) requests`);
console.log('정리 후:', left);
await conn.end();
