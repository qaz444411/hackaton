/**
 * "여기서 먹고싶어요" 마커 → 밥친구 매칭 전체 흐름 스모크 테스트.
 *
 *   node scripts/smoke-spot.js            테스트 데이터를 남긴다(화면에서 눈으로 확인용)
 *   node scripts/smoke-spot.js --cleanup  검증 후 만든 데이터를 되돌린다
 *
 * 서버(4000)가 떠 있어야 한다. 실제 HTTP 로 호출해 라우트·검증·DB 제약을 한 번에 본다.
 */
import 'dotenv/config';
import mysql from 'mysql2/promise';

const BASE = `http://localhost:${process.env.PORT || 4000}/api`;
const CLEANUP = process.argv.includes('--cleanup');
const stamp = Date.now().toString().slice(-9);

const results = [];
const check = (name, ok, detail = '') => {
  results.push({ 검증: name, 결과: ok ? 'PASS' : 'FAIL', 상세: String(detail).slice(0, 60) });
  if (!ok) process.exitCode = 1;
};

async function call(path, { method = 'GET', token, body } = {}) {
  const res = await fetch(BASE + path, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  if (!res.ok) {
    const err = new Error(`${method} ${path} → ${res.status} ${JSON.stringify(data)}`);
    err.status = res.status; err.data = data;
    throw err;
  }
  return data;
}

// 테스트 지점 — 서울 시청 근처, 실제 좌표
const SPOT = { lat: 37.5665, lng: 126.9780 };

const created = { users: [], spots: [], requests: [], proposals: [], matches: [] };

async function signup(tag) {
  const codes = await call('/codes');
  const region = codes.region?.[0]?.code;
  const out = await call('/auth/signup', {
    method: 'POST',
    body: {
      email: `smoke${tag}${stamp}@test.local`,
      password: 'Test1234!@',
      nickname: `스모크${tag}${stamp.slice(-4)}`,
      age: 25, gender: tag === 'A' ? 'FEMALE' : 'MALE',
      regionCode: region,
    },
  });
  created.users.push(out.user.id);
  return { token: out.token, id: out.user.id, nickname: out.user.nickname, codes };
}

async function startSpotMatching(user, spotId, codes) {
  const draft = await call('/matching/draft', {
    method: 'POST', token: user.token,
    body: {
      matchingType: 'SPOT', spotId,
      foodTypeCode: codes.food[0].code,
      talkStyleCode: codes.talk[0].code,
      mealTimeCode: codes.meal[0].code,
      priceMin: 0, priceMax: 100000,
    },
  });
  created.requests.push(draft.id);
  await call(`/matching/${draft.id}/start`, { method: 'POST', token: user.token });
  return draft.id;
}

async function main() {
  console.log(`서버: ${BASE}\n`);

  // 0) 사용자 2명
  const A = await signup('A');
  const B = await signup('B');
  check('테스트 사용자 2명 생성', !!A.token && !!B.token, `A=${A.id} B=${B.id}`);

  // 1) A 가 지도에 마커를 찍는다
  const spot = await call('/spots', {
    method: 'POST', token: A.token,
    body: { label: `스모크 지점 ${stamp}`, lat: SPOT.lat, lng: SPOT.lng },
  });
  created.spots.push(spot.spot_id);
  check('마커 생성 (POST /spots)', !!spot.spot_id, `spot_id=${spot.spot_id}`);
  check('생성 직후 모집 인원 0', spot.recruiting_count === 0, `count=${spot.recruiting_count}`);

  // 2) 같은 자리에 또 찍으면 새로 만들지 않고 기존 걸 준다 (핀 난립 방지)
  const dup = await call('/spots', {
    method: 'POST', token: B.token,
    body: { label: `스모크 지점 ${stamp}`, lat: SPOT.lat + 0.00005, lng: SPOT.lng },
  });
  check('15m 이내 같은 이름은 재사용', dup.spot_id === spot.spot_id, `${dup.spot_id} vs ${spot.spot_id}`);

  // 3) A 가 그 지점에서 모집 시작
  const reqA = await startSpotMatching(A, spot.spot_id, A.codes);
  check('A: SPOT 모집 시작', !!reqA, `request=${reqA}`);

  // 4) B 가 주변 조회 → A 의 마커가 모집 1명으로 보여야 한다
  const nearby = await call(`/spots?lat=${SPOT.lat}&lng=${SPOT.lng}&radius=2000`, { token: B.token });
  const found = nearby.find((s) => s.spot_id === spot.spot_id);
  check('B: 주변 마커 조회에 포함', !!found, `${nearby.length}건 조회`);
  check('모집 인원 1명으로 집계', found?.recruiting_count === 1, `count=${found?.recruiting_count}`);
  check('거리 계산 동작', typeof found?.distance_m === 'number', `${found?.distance_m}m`);

  // 5) B 가 그 지점의 밥친구 목록에서 A 를 본다
  const buddies = await call(`/spots/${spot.spot_id}/buddies`, { token: B.token });
  check('B: 밥친구 목록에 A 노출', buddies.some((b) => b.user_id === A.id), `${buddies.length}명`);
  check('취향 일치율 계산됨', buddies[0]?.match_rate !== undefined, `rate=${buddies[0]?.match_rate}`);

  // 6) B 도 모집을 걸고 A 에게 매칭 요청
  const reqB = await startSpotMatching(B, spot.spot_id, B.codes);
  const proposal = await call('/proposals', {
    method: 'POST', token: B.token,
    body: { requesterRequestId: reqB, receiverUserId: A.id },
  });
  created.proposals.push(proposal.id);
  check('B → A 매칭 요청 생성', !!proposal.id, `proposal=${proposal.id}`);

  // 7) A 가 수락 → sp_accept_proposal 이 meal_match + 채팅방까지 만든다
  const accepted = await call(`/proposals/${proposal.id}/accept`, { method: 'POST', token: A.token });
  created.matches.push(accepted.matchId);
  check('A 수락 → 매칭 확정', !!accepted.matchId, `match=${accepted.matchId}`);

  // 8) DB 에서 실제로 spot_id 가 보존됐는지 확인 (v3 프로시저 갱신 검증)
  const conn = await mysql.createConnection({
    host: process.env.DB_HOST, port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER, password: process.env.DB_PASSWORD, database: process.env.DB_NAME,
  });
  const [[m]] = await conn.query(
    'SELECT spot_id, restaurant_id, status FROM meal_match WHERE id = ?', [accepted.matchId]);
  check('meal_match.spot_id 보존', Number(m?.spot_id) === Number(spot.spot_id),
    `spot_id=${m?.spot_id}, restaurant_id=${m?.restaurant_id}`);

  // chat_room 은 PK 가 match_id (확정 매칭 1건 = 채팅방 1개)
  const [[room]] = await conn.query(
    'SELECT match_id, status FROM chat_room WHERE match_id = ?', [accepted.matchId]);
  check('채팅방 자동 생성(트리거)', !!room?.match_id, `room=${room?.match_id} ${room?.status ?? ''}`);

  // 9) 확정되면 모집이 닫혀서 지도에서 인원이 빠진다
  const after = await call(`/spots?lat=${SPOT.lat}&lng=${SPOT.lng}&radius=2000`, { token: B.token });
  const afterSpot = after.find((s) => s.spot_id === spot.spot_id);
  check('확정 후 모집 인원 0으로 복귀', afterSpot?.recruiting_count === 0,
    `count=${afterSpot?.recruiting_count}`);

  // 10) 잘못된 입력은 400 으로 막힌다
  let rejected = false;
  try {
    await call('/matching/draft', {
      method: 'POST', token: B.token,
      body: { matchingType: 'SPOT', foodTypeCode: B.codes.food[0].code,
              talkStyleCode: B.codes.talk[0].code, mealTimeCode: B.codes.meal[0].code,
              priceMin: 0, priceMax: 100000 },   // spotId 누락
    });
  } catch (e) { rejected = e.status === 400 || e.status === 409; }
  check('spotId 누락 시 400/409 로 거부', rejected);

  console.table(results);

  if (CLEANUP) {
    console.log('\n정리 중…');
    await cleanup(conn);
    console.log('테스트 데이터 삭제 완료');
  } else {
    console.log(`\n테스트 데이터를 남겨 뒀습니다. 지도에서 "스모크 지점 ${stamp}" 로 확인 가능.`);
    console.log('되돌리려면: node scripts/smoke-spot.js --cleanup 대신 아래 id 들을 직접 지우세요.');
    console.log(JSON.stringify(created));
  }
  await conn.end();

  const failed = results.filter((r) => r.결과 === 'FAIL').length;
  console.log(failed ? `\n실패 ${failed}건` : '\n전부 통과');
}

/** 이 스크립트가 만든 행만 FK 순서대로 되돌린다 */
async function cleanup(conn) {
  const del = async (sql, params) => {
    try { await conn.query(sql, params); }
    catch (e) { console.warn('  정리 실패(무시):', e.code, sql.slice(0, 50)); }
  };
  const users = created.users;
  if (!users.length) return;

  const matches = created.matches.length ? created.matches : [0];
  await del('DELETE FROM chat_message WHERE match_id IN (?)', [matches]);
  // meal_match 를 지우면 chat_room / match_participant 는 ON DELETE CASCADE 로 함께 사라진다.
  // match_participant 를 직접 지우면 trg_match_participant_del 이 막는다(참여자 2명 불변식).
  // MySQL 은 FK CASCADE 로 지워질 때는 트리거를 실행하지 않으므로 이 순서가 유일하게 통한다.
  await del('DELETE FROM meal_match WHERE id IN (?)', [matches]);
  await del('DELETE FROM match_proposal WHERE requester_user_id IN (?) OR receiver_user_id IN (?)', [users, users]);
  await del('DELETE FROM matching_status_history WHERE matching_request_id IN (?)',
    [created.requests.length ? created.requests : [0]]);
  await del('DELETE FROM matching_request WHERE user_id IN (?)', [users]);
  await del('DELETE FROM map_spot WHERE id IN (?)', [created.spots.length ? created.spots : [0]]);
  await del('DELETE FROM user_interest WHERE user_id IN (?)', [users]);
  await del('DELETE FROM user_profile WHERE user_id IN (?)', [users]);
  await del('DELETE FROM users WHERE id IN (?)', [users]);
}

main().catch((e) => {
  console.error('\n중단:', e.message);
  if (e.cause) console.error('원인:', e.cause);
  console.error(e.stack);
  process.exit(1);
});
