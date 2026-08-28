/**
 * 매칭 탐색 시나리오 검증 — node scripts/smoke-match.js
 *
 * "서로 다른 기기에서 매칭을 눌렀는데 상대가 안 뜬다" 는 문제를 막기 위한 회귀 테스트.
 * 실제로 두 계정을 만들어 각 조합에서 상대가 보이는지 확인한다.
 */
import 'dotenv/config';
import mysql from 'mysql2/promise';

const BASE = `http://localhost:${process.env.PORT || 4000}/api`;
const stamp = Date.now().toString().slice(-9);
const created = { users: [], requests: [] };
let seq = 0;

const results = [];
const check = (name, ok, detail = '') => {
  results.push({ 시나리오: name, 결과: ok ? 'PASS' : 'FAIL', 상세: String(detail).slice(0, 34) });
  if (!ok) process.exitCode = 1;
};

async function call(path, { method = 'GET', token, body } = {}) {
  const res = await fetch(BASE + path, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let d = null; try { d = text ? JSON.parse(text) : null; } catch { d = text; }
  if (!res.ok) { const e = new Error(`${method} ${path} -> ${res.status}`); e.status = res.status; e.data = d; throw e; }
  return d;
}

const codes = await call('/codes');

async function mkUser(gender, withProfile = true) {
  const tag = `${seq++}`;
  const u = await call('/auth/signup', {
    method: 'POST',
    body: { email: `mt${tag}${stamp}@test.local`, password: 'Test1234!@',
            nickname: `매칭${tag}${stamp.slice(-4)}`, age: 25, gender,
            regionCode: codes.region[0].code },
  });
  created.users.push(u.user.id);
  if (withProfile) {
    await call('/users/profile', {
      method: 'POST', token: u.token,
      body: { mbtiCode: codes.mbti[0], hasAllergy: false, spicyLevel: 2, oilyLevel: 2,
              interestIds: codes.interest.slice(0, 3).map((i) => i.id) },
    });
  }
  return u;
}

async function start(u, body) {
  const d = await call('/matching/draft', { method: 'POST', token: u.token, body });
  created.requests.push(d.id);
  await call(`/matching/${d.id}/start`, { method: 'POST', token: u.token });
  return d.id;
}

const RANDOM = { matchingType: 'RANDOM', foodTypeCode: 'KOREAN', talkStyleCode: 'EASY',
                 mealTimeCode: 'LUNCH', priceMin: 10000, priceMax: 30000 };

/** A 가 B 를 후보로 보는지 */
async function pair(name, aPref, bPref, { bProfile = true, relax = false, expect = true } = {}) {
  const A = await mkUser('FEMALE');
  const B = await mkUser('MALE', bProfile);
  const rA = await start(A, aPref);
  await start(B, bPref);
  const cands = await call(`/matching/${rA}/candidates?limit=100${relax ? "&relax=1" : ""}`, { token: A.token });
  const hit = cands.find((x) => x.user_id === B.user.id);
  check(name, !!hit === expect, hit ? `보임 (${hit.match_level})` : '안 보임');
  return hit;
}

console.log('두 사람이 각자 기기에서 매칭을 누른 상황\n');

// 기본
await pair('둘 다 같은 조건 RANDOM', RANDOM, RANDOM);

// 이번에 고친 것들
await pair('상대가 프로필 미작성', RANDOM, RANDOM, { bProfile: false });
await pair('A=랜덤 / B=지도(MAP) 서로 다른 버튼',
  RANDOM, { ...RANDOM, matchingType: 'MAP', restaurantId: 45 });
await pair('A=지도(MAP) / B=랜덤',
  { ...RANDOM, matchingType: 'MAP', restaurantId: 45 }, RANDOM);

// 엄격 조건에서는 안 잡혀야 정상
await pair('시간대 아침 vs 저녁 (엄격)',
  { ...RANDOM, mealTimeCode: 'BREAKFAST' }, { ...RANDOM, mealTimeCode: 'DINNER' },
  { expect: false });
await pair('음식 한식 vs 일식 (엄격)',
  { ...RANDOM, foodTypeCode: 'KOREAN' }, { ...RANDOM, foodTypeCode: 'JAPANESE' },
  { expect: false });
await pair('가격대 안 겹침 (엄격)',
  { ...RANDOM, priceMin: 0, priceMax: 10000 }, { ...RANDOM, priceMin: 50000, priceMax: 90000 },
  { expect: false });

// 조건을 넓히면 잡혀야 한다
const near1 = await pair('시간대 달라도 relax=1 이면 잡힘',
  { ...RANDOM, mealTimeCode: 'BREAKFAST' }, { ...RANDOM, mealTimeCode: 'DINNER' },
  { relax: true });
check('  └ NEAR 로 표시', near1?.match_level === 'NEAR', near1?.match_level);

const near2 = await pair('음식 달라도 relax=1 이면 잡힘',
  { ...RANDOM, foodTypeCode: 'KOREAN' }, { ...RANDOM, foodTypeCode: 'JAPANESE' },
  { relax: true });
check('  └ NEAR 로 표시', near2?.match_level === 'NEAR', near2?.match_level);

// 같은 조건이면 relax 여도 EXACT 여야 한다
const exact = await pair('조건 같으면 relax 여도 EXACT', RANDOM, RANDOM, { relax: true });
check('  └ EXACT 로 표시', exact?.match_level === 'EXACT', exact?.match_level);

// 서로 다른 장소를 지정한 지도 매칭은 섞이면 안 된다
await pair('서로 다른 식당의 지도 매칭은 안 섞임',
  { ...RANDOM, matchingType: 'MAP', restaurantId: 45 },
  { ...RANDOM, matchingType: 'MAP', restaurantId: 46 },
  { expect: false });

// 진단 API
const A = await mkUser('FEMALE');
const rA = await start(A, { ...RANDOM, mealTimeCode: 'BREAKFAST', foodTypeCode: 'WESTERN',
                            priceMin: 90000, priceMax: 100000 });
const diag = await call(`/matching/${rA}/diagnosis`, { token: A.token });
check('진단 API 가 원인을 알려줌', Array.isArray(diag.reasons) && diag.reasons.length > 0,
  diag.reasons?.[0]);
check('진단에 매칭 중 인원 포함', typeof diag.searching === 'number', `${diag.searching}명`);

console.table(results);

/* 정리 */
const conn = await mysql.createConnection({
  host: process.env.DB_HOST, port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER, password: process.env.DB_PASSWORD, database: process.env.DB_NAME,
});
const del = async (sql, p) => { try { await conn.query(sql, p); } catch (e) { console.warn('  정리 실패:', e.code); } };
await del('DELETE FROM match_proposal WHERE requester_user_id IN (?) OR receiver_user_id IN (?)', [created.users, created.users]);
await del('DELETE FROM matching_status_history WHERE matching_request_id IN (?)', [created.requests]);
await del('DELETE FROM matching_request WHERE user_id IN (?)', [created.users]);
await del('DELETE FROM user_interest WHERE user_id IN (?)', [created.users]);
await del('DELETE FROM user_profile WHERE user_id IN (?)', [created.users]);
await del('DELETE FROM users WHERE id IN (?)', [created.users]);
await conn.end();
console.log('테스트 데이터 삭제 완료');

const failed = results.filter((r) => r.결과 === 'FAIL').length;
console.log(failed ? `\n실패 ${failed}건` : '\n전부 통과');
