/**
 * 매칭 취소 + 마커 직접 제안 흐름 검증 — node scripts/smoke-cancel.js
 *
 * 화면에서 고친 두 가지가 실제로 서버 흐름과 맞는지 확인한다.
 *  ① 매칭을 시작한 뒤 취소하면 새 매칭을 다시 시작할 수 있는가
 *  ② 마커를 누른 사람이 "밥 같이 할까요?" 로 바로 제안을 보낼 수 있는가
 */
import 'dotenv/config';
import mysql from 'mysql2/promise';

const BASE = `http://localhost:${process.env.PORT || 4000}/api`;
const stamp = Date.now().toString().slice(-9);

const results = [];
const check = (name, ok, detail = '') => {
  results.push({ 검증: name, 결과: ok ? 'PASS' : 'FAIL', 상세: String(detail).slice(0, 50) });
  if (!ok) process.exitCode = 1;
};

async function call(path, { method = 'GET', token, body } = {}) {
  const res = await fetch(BASE + path, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  if (!res.ok) { const e = new Error(`${method} ${path} → ${res.status}`); e.status = res.status; e.data = data; throw e; }
  return data;
}

const codes = await call('/codes');
const mk = (tag) => call('/auth/signup', {
  method: 'POST',
  body: {
    email: `cancel${tag}${stamp}@test.local`, password: 'Test1234!@',
    nickname: `취소${tag}${stamp.slice(-4)}`, age: 26,
    gender: tag === 'A' ? 'FEMALE' : 'MALE', regionCode: codes.region[0].code,
  },
});
const pref = {
  foodTypeCode: codes.food[0].code, talkStyleCode: codes.talk[0].code,
  mealTimeCode: codes.meal[0].code, priceMin: 0, priceMax: 100000,
};

const A = await mk('A');
const B = await mk('B');
const created = { users: [A.user.id, B.user.id], spots: [], requests: [], matches: [] };

/* ── ① 취소하면 다시 시작할 수 있는가 ───────────────── */
const d1 = await call('/matching/draft', { method: 'POST', token: A.token, body: { matchingType: 'RANDOM', ...pref } });
created.requests.push(d1.id);
await call(`/matching/${d1.id}/start`, { method: 'POST', token: A.token });

const cur1 = await call('/matching/current', { token: A.token });
check('진행 중 매칭을 홈에서 조회 가능', cur1?.status === 'SEARCHING', `id=${cur1?.id}`);
check('화면에 띄울 라벨 존재', !!cur1?.food_type && !!cur1?.meal_time,
  `${cur1?.food_type}/${cur1?.meal_time}`);

// 취소 전에는 새 매칭이 막혀야 한다(기존 동작 확인)
let blocked = false;
try { await call('/matching/draft', { method: 'POST', token: A.token, body: { matchingType: 'RANDOM', ...pref } }); }
catch (e) { blocked = e.status === 409; }
check('취소 전에는 새 매칭 차단(409)', blocked);

// 취소
await call(`/matching/${d1.id}/cancel`, { method: 'POST', token: A.token });
const cur2 = await call('/matching/current', { token: A.token });
check('취소 후 진행 중 매칭 없음', cur2 === null, `current=${JSON.stringify(cur2)}`);

// 다시 시작 — 이게 되어야 "갇힘"이 풀린 것
let restarted = null;
try {
  restarted = await call('/matching/draft', { method: 'POST', token: A.token, body: { matchingType: 'RANDOM', ...pref } });
  created.requests.push(restarted.id);
} catch (e) { /* 아래 check 에서 잡힌다 */ }
check('취소 후 새 매칭 시작 가능', !!restarted, restarted ? `새 id=${restarted.id}` : '실패 — 여전히 갇힘');
if (restarted) await call(`/matching/${restarted.id}/cancel`, { method: 'POST', token: A.token });

/* ── ② 마커 → "밥 같이 할까요?" 직접 제안 ───────────── */
// A 가 마커를 찍고 모집
const spot = await call('/spots', {
  method: 'POST', token: A.token,
  body: { label: `취소테스트 지점 ${stamp}`, lat: 37.5665, lng: 126.9780 },
});
created.spots.push(spot.spot_id);
const dA = await call('/matching/draft', {
  method: 'POST', token: A.token,
  body: { matchingType: 'SPOT', spotId: spot.spot_id, ...pref },
});
created.requests.push(dA.id);
await call(`/matching/${dA.id}/start`, { method: 'POST', token: A.token });

// B 가 마커를 눌렀을 때 배너에 띄울 정보 (preview) 가 오는가
const detail = await call(`/spots/${spot.spot_id}`, { token: B.token });
check('마커 상세에 모집자 목록 포함', (detail.preview || []).length === 1,
  `preview=${detail.preview?.length}명`);
check('모집자 닉네임 표시 가능', !!detail.preview?.[0]?.nickname, detail.preview?.[0]?.nickname);

// B 가 "네, 좋아요" — 활성 요청이 없는 상태에서 바로 제안
const curB = await call('/matching/current', { token: B.token });
check('B 는 활성 요청 없음(직접 제안 시나리오)', curB === null);

const dB = await call('/matching/draft', {
  method: 'POST', token: B.token,
  body: { matchingType: 'SPOT', spotId: spot.spot_id, foodTypeCode: 'ANY', talkStyleCode: 'EASY',
          mealTimeCode: codes.meal[0].code, priceMin: 0, priceMax: 100000 },
});
created.requests.push(dB.id);
const proposal = await call('/proposals', {
  method: 'POST', token: B.token,
  body: { requesterRequestId: dB.id, receiverUserId: A.user.id },
});
check('"밥 같이 할까요?" 요청 전송', !!proposal.id, `proposal=${proposal.id}`);

// A 의 보관함에 "아니요/수락" 으로 응답할 항목이 뜨는가
const inbox = await call('/proposals', { token: A.token });
const item = inbox.find((p) => p.proposal_id === proposal.id);
check('받는 사람 보관함에 노출', !!item, `${inbox.length}건`);
check('PENDING 상태로 응답 대기', item?.status === 'PENDING', item?.status);

// "아니요" (거절) 가 동작하는가
await call(`/proposals/${proposal.id}/decline`, { method: 'POST', token: A.token });
const inbox2 = await call('/proposals', { token: A.token });
check('거절 반영됨', inbox2.find((p) => p.proposal_id === proposal.id)?.status === 'DECLINED');

// 중복 제안은 친절한 오류로 막히는가
let dup = false;
try { await call('/proposals', { method: 'POST', token: B.token, body: { requesterRequestId: dB.id, receiverUserId: A.user.id } }); }
catch (e) { dup = e.status === 409; }
check('같은 상대 재요청은 409', dup);

console.table(results);

/* ── 정리 ─────────────────────────────────────────── */
const conn = await mysql.createConnection({
  host: process.env.DB_HOST, port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER, password: process.env.DB_PASSWORD, database: process.env.DB_NAME,
});
const del = async (sql, p) => { try { await conn.query(sql, p); } catch (e) { console.warn('  정리 실패:', e.code); } };
if (created.matches.length) await del('DELETE FROM meal_match WHERE id IN (?)', [created.matches]);
await del('DELETE FROM match_proposal WHERE requester_user_id IN (?) OR receiver_user_id IN (?)', [created.users, created.users]);
await del('DELETE FROM matching_status_history WHERE matching_request_id IN (?)', [created.requests.length ? created.requests : [0]]);
await del('DELETE FROM matching_request WHERE user_id IN (?)', [created.users]);
await del('DELETE FROM map_spot WHERE id IN (?)', [created.spots.length ? created.spots : [0]]);
await del('DELETE FROM user_profile WHERE user_id IN (?)', [created.users]);
await del('DELETE FROM users WHERE id IN (?)', [created.users]);
await conn.end();
console.log('테스트 데이터 삭제 완료');

const failed = results.filter((r) => r.결과 === 'FAIL').length;
console.log(failed ? `\n실패 ${failed}건` : '\n전부 통과');
