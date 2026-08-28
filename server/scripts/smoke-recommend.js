/**
 * 위치 기반 맛집 추천 검증 — node scripts/smoke-recommend.js
 *
 * 핵심은 "AI 가 없는 식당을 지어내지 않는가" 다.
 * 추천으로 돌아온 식당이 실제 DB/카카오 결과에 있는지 대조한다.
 */
import 'dotenv/config';
import mysql from 'mysql2/promise';

const BASE = `http://localhost:${process.env.PORT || 4000}/api`;
const stamp = Date.now().toString().slice(-9);
const provider = (process.env.AI_PROVIDER || 'gemini').trim().toLowerCase();

// 서울시청 — 음식점이 확실히 많은 좌표
const AT = { lat: 37.5665, lng: 126.9780 };

const results = [];
const check = (name, ok, detail = '') => {
  results.push({ 검증: name, 결과: ok ? 'PASS' : 'FAIL', 상세: String(detail).replace(/\s+/g, ' ').slice(0, 46) });
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

console.log(`AI_PROVIDER: ${provider}\n`);

const codes = await call('/codes');
const u = await call('/auth/signup', {
  method: 'POST',
  body: { email: `rec${stamp}@test.local`, password: 'Test1234!@',
          nickname: `추천${stamp.slice(-4)}`, age: 27, gender: 'FEMALE',
          regionCode: codes.region[0].code },
});
const token = u.token;

/*
 * 기준이 될 "실재하는 음식점" 집합.
 *
 * 주의: /restaurants 를 키워드 없이 한 번 부른 결과와 비교하면 안 된다.
 * 도우미는 사용자가 말한 음식으로 카카오를 다시 검색하므로 그 시점에 새 가게가
 * DB 에 캐시된다. 그래서 "지어냈다" 판정은 DB 전체(restaurant 테이블) 기준으로 한다.
 * 실제로 추천은 서버가 조회한 목록에서 번호로 꺼내므로 구조상 창작이 불가능하지만,
 * 그 불변식이 깨지지 않는지 확인하는 것이 이 테스트의 목적이다.
 */
const conn0 = await mysql.createConnection({
  host: process.env.DB_HOST, port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER, password: process.env.DB_PASSWORD, database: process.env.DB_NAME,
});
const realNames = async () => {
  const [rows] = await conn0.query('SELECT name FROM restaurant');
  return new Set(rows.map((r) => r.name));
};

const nearby = await call(`/restaurants?lat=${AT.lat}&lng=${AT.lng}&radius=1500`, { token });
check('주변 음식점 조회됨', nearby.length > 0, `${nearby.length}곳`);

/* 1) 위치를 주고 음식 추천 요청 */
const rec = await call('/assistant/chat', {
  method: 'POST', token,
  body: { message: '이 근처에서 점심 뭐 먹을지 추천해줘', history: [], lat: AT.lat, lng: AT.lng },
});
console.log(`[Q] 이 근처에서 점심 뭐 먹을지 추천해줘\n[A] ${rec.reply}\n`);
console.log('추천된 식당:', (rec.restaurants || []).map((r) => `${r.name}(${r.distance_m}m)`).join(', ') || '없음', '\n');

check('추천 응답 도착', !!rec.reply, `source=${rec.source}`);
check('restaurants 필드 존재', Array.isArray(rec.restaurants));
check('추천 식당 1곳 이상', (rec.restaurants || []).length > 0, `${rec.restaurants?.length}곳`);

/* 2) ★ 핵심 — 지어낸 식당이 없는가 */
const names1 = await realNames();
const invented = (rec.restaurants || []).filter((r) => !names1.has(r.name));
check('지어낸 식당 없음 (전부 실재)', invented.length === 0,
  invented.length ? `가짜: ${invented.map((r) => r.name).join(',')}` : '전부 실재');

/* 3) 추천 카드에 화면이 쓰는 필드가 다 있는가 */
const first = rec.restaurants?.[0];
check('카드에 필요한 필드 포함', !!first?.restaurant_id && !!first?.name && first?.distance_m !== undefined,
  first ? `id=${first.restaurant_id} ${first.name}` : '없음');

/* 4) "추천:1,4" 내부 표기가 사용자에게 새지 않는가 */
check('추천 번호 줄이 답변에 노출되지 않음', !/추천\s*[:：]\s*[0-9,\s]+$/m.test(rec.reply));

/* 5) 위치를 안 주면 추천 없이 대화만 */
const noLoc = await call('/assistant/chat', {
  method: 'POST', token,
  body: { message: '이 근처에서 점심 뭐 먹을지 추천해줘', history: [] },
});
check('위치 없으면 추천 생략', (noLoc.restaurants || []).length === 0, `${noLoc.restaurants?.length ?? 0}곳`);
check('위치 없어도 답변은 옴', !!noLoc.reply, `source=${noLoc.source}`);

/* 6) 음식과 무관한 질문에는 추천이 붙지 않는가 */
const chat = await call('/assistant/chat', {
  method: 'POST', token,
  body: { message: '보관함은 어디서 봐요?', history: [], lat: AT.lat, lng: AT.lng },
});
check('음식 얘기가 아니면 추천 없음', (chat.restaurants || []).length === 0, `${chat.restaurants?.length ?? 0}곳`);

/* 7) 특정 음식을 말하면 그 종류를 반영하는가 */
const sushi = await call('/assistant/chat', {
  method: 'POST', token,
  body: { message: '초밥 먹고 싶은데 근처에 있어?', history: [], lat: AT.lat, lng: AT.lng },
});
console.log(`[Q] 초밥 먹고 싶은데 근처에 있어?\n[A] ${sushi.reply}\n`);
check('특정 음식 요청도 응답', !!sushi.reply, `추천 ${sushi.restaurants?.length ?? 0}곳`);
const names2 = await realNames();
const sushiInvented = (sushi.restaurants || []).filter((r) => !names2.has(r.name));
check('특정 음식 추천도 전부 실재', sushiInvented.length === 0,
  sushiInvented.length ? sushiInvented.map((r) => r.name).join(',') : 'OK');

/* 8) 잘못된 좌표는 거부 */
let bad = false;
try {
  await call('/assistant/chat', { method: 'POST', token,
    body: { message: '추천해줘', history: [], lat: 999, lng: 999 } });
} catch (e) { bad = e.status === 400; }
check('범위 밖 좌표 400 거부', bad);

console.table(results);

const conn = await mysql.createConnection({
  host: process.env.DB_HOST, port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER, password: process.env.DB_PASSWORD, database: process.env.DB_NAME,
});
await conn0.end();
await conn.query('DELETE FROM users WHERE id = ?', [u.user.id]);
await conn.end();
console.log('테스트 계정 삭제 완료');

const failed = results.filter((r) => r.결과 === 'FAIL').length;
console.log(failed ? `\n실패 ${failed}건` : '\n전부 통과');
