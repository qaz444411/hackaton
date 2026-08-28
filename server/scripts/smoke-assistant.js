/**
 * AI 도우미(제미나이 챗봇) 스모크 테스트 — node scripts/smoke-assistant.js
 *
 * 키가 있으면 실제 응답까지, 없으면 안내 문구 폴백까지 검증한다.
 * 테스트 계정은 끝나면 지운다.
 */
import 'dotenv/config';
import mysql from 'mysql2/promise';

const BASE = `http://localhost:${process.env.PORT || 4000}/api`;
const stamp = Date.now().toString().slice(-9);
const provider = (process.env.AI_PROVIDER || 'gemini').trim().toLowerCase();
// bedrock 은 인스턴스 프로파일로 인증하므로 키 설정 여부라는 개념이 없다
const hasKey = provider === 'bedrock' ? true : !!process.env.GEMINI_API_KEY;
const expectedSource = provider === 'bedrock' ? 'BEDROCK' : 'GEMINI';

const results = [];
const check = (name, ok, detail = '') => {
  results.push({ 검증: name, 결과: ok ? 'PASS' : 'FAIL', 상세: String(detail).replace(/\s+/g, ' ').slice(0, 55) });
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

console.log(`서버: ${BASE}`);
console.log(`AI_PROVIDER   : ${provider} (기대 source=${expectedSource})`);
console.log(`인증          : ${provider === "bedrock" ? "EC2 인스턴스 프로파일" : (hasKey ? "GEMINI_API_KEY 설정됨" : "키 없음 — 폴백 경로 검증")}
`);

// 테스트 계정
const codes = await call('/codes');
const signed = await call('/auth/signup', {
  method: 'POST',
  body: {
    email: `smokeAI${stamp}@test.local`, password: 'Test1234!@',
    nickname: `AI테스트${stamp.slice(-4)}`, age: 24, gender: 'FEMALE',
    regionCode: codes.region[0].code,
  },
});
const token = signed.token;
check('테스트 계정 생성', !!token, `user=${signed.user.id}`);

// 1) 상태
const status = await call('/assistant/status', { token });
check('GET /assistant/status', typeof status.enabled === 'boolean',
  `enabled=${status.enabled} model=${status.model}`);
check('상태가 실제 키 설정과 일치', status.enabled === hasKey, `${status.enabled} vs ${hasKey}`);

// 2) 추천 질문
const st = await call('/assistant/starters', { token });
check('GET /assistant/starters 3개', st.starters?.length === 3, st.starters?.join(' / '));

// 3) 첫 대화
const a1 = await call('/assistant/chat', {
  method: 'POST', token, body: { message: '오늘 뭐 먹을지 못 정하겠어요', history: [] },
});
check('첫 질문에 응답', !!a1.reply && a1.reply.length > 5, `source=${a1.source}`);
console.log(`\n[Q] 오늘 뭐 먹을지 못 정하겠어요\n[A] ${a1.reply}\n`);

if (hasKey) {
  check(`${expectedSource} 가 실제로 응답`, a1.source === expectedSource, `source=${a1.source}`);
} else {
  check('키 없으면 안내 문구 반환', a1.source === 'NO_KEY', `source=${a1.source}`);
  check('안내에 GEMINI_API_KEY 언급', a1.reply.includes('GEMINI_API_KEY'));
}

// 4) 문맥 유지 (이력을 넘겼을 때 앞 대화를 기억하는지)
const a2 = await call('/assistant/chat', {
  method: 'POST', token,
  body: {
    message: '방금 말한 것 중에 첫 번째로 다시 알려줘요',
    history: [
      { role: 'user', text: '오늘 뭐 먹을지 못 정하겠어요' },
      { role: 'model', text: a1.reply },
    ],
  },
});
check('이력 포함 대화 성공', !!a2.reply, `source=${a2.source}`);
if (hasKey) console.log(`[Q] 방금 말한 것 중 첫 번째 다시\n[A] ${a2.reply}\n`);

// 5) 앱 사용법 질문 — 시스템 프롬프트가 먹었는지
const a3 = await call('/assistant/chat', {
  method: 'POST', token, body: { message: '지도에 마커 찍는 건 어떻게 해요?', history: [] },
});
check('앱 사용법 질문 응답', !!a3.reply, `source=${a3.source}`);
if (hasKey) {
  check('마커=길게 누르기 안내 포함', /길게|꾹|롱프레스/.test(a3.reply), a3.reply);
  console.log(`[Q] 지도에 마커 찍는 건 어떻게 해요?\n[A] ${a3.reply}\n`);
}

// 6) 입력 검증
let bad = false;
try { await call('/assistant/chat', { method: 'POST', token, body: { message: '' } }); }
catch (e) { bad = e.status === 400; }
check('빈 메시지 400 거부', bad);

let tooLong = false;
try { await call('/assistant/chat', { method: 'POST', token, body: { message: 'ㄱ'.repeat(501) } }); }
catch (e) { tooLong = e.status === 400; }
check('500자 초과 400 거부', tooLong);

// 7) 비인증 차단
let unauth = false;
try { await call('/assistant/chat', { method: 'POST', body: { message: '안녕' } }); }
catch (e) { unauth = e.status === 401; }
check('토큰 없으면 401', unauth);

console.table(results);

// 정리
const conn = await mysql.createConnection({
  host: process.env.DB_HOST, port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER, password: process.env.DB_PASSWORD, database: process.env.DB_NAME,
});
await conn.query('DELETE FROM users WHERE id = ?', [signed.user.id]);
await conn.end();
console.log('테스트 계정 삭제 완료');

const failed = results.filter((r) => r.결과 === 'FAIL').length;
console.log(failed ? `\n실패 ${failed}건` : '\n전부 통과');
