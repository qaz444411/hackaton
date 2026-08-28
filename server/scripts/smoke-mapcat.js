/**
 * 지도 음식 종류 표시 검증 — node scripts/smoke-mapcat.js
 *
 * v6 패치로 뷰에 category_name 이 실렸는지, 그리고 실제 데이터에서
 * 아이콘이 얼마나 붙는지(커버리지)를 확인한다.
 */
import 'dotenv/config';
import mysql from 'mysql2/promise';

const BASE = `http://localhost:${process.env.PORT || 4000}/api`;
const stamp = Date.now().toString().slice(-9);
const AT = { lat: 37.5665, lng: 126.9780 };

const results = [];
const check = (name, ok, detail = '') => {
  results.push({ 검증: name, 결과: ok ? 'PASS' : 'FAIL', 상세: String(detail).slice(0, 44) });
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

/* 클라이언트 매핑 로직을 그대로 가져와 같은 결과인지 본다 */
const { foodIcon, shortCategory, applyFoodFilter, FOOD_FILTERS } =
  await import('../../client/src/lib/foodCategory.js');

const codes = await call('/codes');
const u = await call('/auth/signup', {
  method: 'POST',
  body: { email: `cat${stamp}@test.local`, password: 'Test1234!@',
          nickname: `분류${stamp.slice(-4)}`, age: 26, gender: 'MALE',
          regionCode: codes.region[0].code },
});

const list = await call(`/restaurants?lat=${AT.lat}&lng=${AT.lng}&radius=1500`, { token: u.token });
check('음식점 조회', list.length > 0, `${list.length}곳`);

/* ① v6 — 뷰가 category_name 을 내려주는가 */
const withCat = list.filter((r) => r.category_name);
check('API 응답에 category_name 포함', withCat.length > 0,
  `${withCat.length}/${list.length}곳`);

/* ② 아이콘 커버리지 — 기본값(🍽)이 아닌 비율 */
const icons = list.map((r) => foodIcon(r));
const specific = icons.filter((i) => i !== '🍽').length;
check('아이콘이 종류별로 구분됨', specific / list.length > 0.8,
  `${specific}/${list.length} (${Math.round(specific / list.length * 100)}%)`);

const uniq = [...new Set(icons)];
check('아이콘 종류가 2개 이상', uniq.length >= 2, uniq.join(' '));

/* ③ 세부 카테고리 라벨 */
const labels = list.map((r) => shortCategory(r)).filter(Boolean);
check('세부 카테고리 라벨 추출', labels.length / list.length > 0.8,
  `${labels.length}/${list.length}`);
/*
 * 브랜드명이 분류로 새지 않는지.
 *
 * "음식점 > 한식 > 국밥 > 육대장" 처럼 마지막 조각이 브랜드인 경우에만 잘라내야 한다.
 * "음식점 > 구내식당" 처럼 조각이 하나뿐이면 그건 브랜드가 아니라 분류이므로
 * 가게 이름에 같은 단어가 들어 있어도 그대로 쓰는 게 맞다.
 * 따라서 다단계 분류에서 마지막 조각이 그대로 라벨이 되는 경우만 실패로 본다.
 */
const brandLeak = list.filter((r) => {
  const parts = String(r.category_name || '').split('>').map((s) => s.trim())
    .filter((s) => s && s !== '음식점');
  if (parts.length < 2) return false;
  const last = parts[parts.length - 1];
  return String(r.name).includes(last) && shortCategory(r) === last;
});
check('브랜드명이 분류로 새지 않음', brandLeak.length === 0,
  brandLeak.length ? brandLeak.slice(0, 2).map((r) => `${r.name}:${shortCategory(r)}`).join(',') : 'OK');

/* ④ 필터 */
for (const f of FOOD_FILTERS.filter((x) => x.value !== 'ALL')) {
  const sub = applyFoodFilter(list, f.value);
  const wrong = sub.filter((r) => r.food_type_code !== f.value);
  check(`필터 ${f.label}`, wrong.length === 0, `${sub.length}곳`);
}
check('필터 ALL 은 전체', applyFoodFilter(list, 'ALL').length === list.length);

/* 실제 분포 출력 */
const dist = {};
for (const r of list) {
  const k = `${foodIcon(r)} ${shortCategory(r) || '?'}`;
  dist[k] = (dist[k] || 0) + 1;
}
console.log('\n아이콘 분포 (상위 12):');
Object.entries(dist).sort((a, b) => b[1] - a[1]).slice(0, 12)
  .forEach(([k, n]) => console.log(`  ${k.padEnd(22)} ${n}곳`));

console.log('');
console.table(results);

const conn = await mysql.createConnection({
  host: process.env.DB_HOST, port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER, password: process.env.DB_PASSWORD, database: process.env.DB_NAME,
});
await conn.query('DELETE FROM users WHERE id = ?', [u.user.id]);
await conn.end();

const failed = results.filter((r) => r.결과 === 'FAIL').length;
console.log(failed ? `\n실패 ${failed}건` : '\n전부 통과');

/* ⑤ 음식 종류 분류 규칙 — 치킨/패스트푸드가 한식으로 새지 않는지 */
const { mapFoodType } = await import('../src/services/kakao.service.js');
const CASES = [
  ['음식점 > 치킨 > 교촌치킨',            'WESTERN'],
  ['음식점 > 치킨 > BBQ',                 'WESTERN'],
  ['음식점 > 패스트푸드 > 맥도날드',      'WESTERN'],
  ['음식점 > 패스트푸드 > 샌드위치',      'WESTERN'],
  ['음식점 > 간식 > 제과,베이커리',       'WESTERN'],
  ['음식점 > 양식 > 피자',                'WESTERN'],
  ['음식점 > 한식 > 국밥',                'KOREAN'],
  ['음식점 > 분식',                       'KOREAN'],
  ['음식점 > 일식 > 초밥,롤',             'JAPANESE'],
  ['음식점 > 샤브샤브',                   'JAPANESE'],
  ['음식점 > 중식 > 중국요리',            'CHINESE'],
  ['음식점 > 술집 > 호프,요리주점',       'ETC'],
  ['음식점 > 구내식당',                   'ETC'],
  ['음식점',                              'ETC'],
];
const wrong = CASES.filter(([cat, want]) => mapFoodType(cat) !== want);
check('분류 규칙 14종', wrong.length === 0,
  wrong.length ? wrong.map(([c, w]) => `${c}→${mapFoodType(c)}(기대 ${w})`).join(' / ') : 'OK');

/* ⑥ DB 에 한식으로 잘못 남은 게 없는지 */
const conn2 = await mysql.createConnection({
  host: process.env.DB_HOST, port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER, password: process.env.DB_PASSWORD, database: process.env.DB_NAME,
});
const [stale] = await conn2.query('SELECT id, name, category_name, food_type_code FROM restaurant');
const bad = stale.filter((r) => mapFoodType(r.category_name || '') !== r.food_type_code);
check('DB 분류가 규칙과 일치', bad.length === 0,
  bad.length ? `${bad.length}건 불일치 (npm run food:reclassify -- --apply)` : `${stale.length}건 일치`);
await conn2.end();

console.log('');
console.table(results.slice(-2));
const failed2 = results.filter((r) => r.결과 === 'FAIL').length;
if (failed2) process.exitCode = 1;
