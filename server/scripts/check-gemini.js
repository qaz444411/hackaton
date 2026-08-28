/**
 * 제미나이 연결 점검 — node scripts/check-gemini.js
 * 키 유효성 / 사용 가능한 모델 목록 / 실제 호출을 순서대로 확인한다.
 */
import 'dotenv/config';
import { GoogleGenerativeAI } from '@google/generative-ai';

const key = process.env.GEMINI_API_KEY;
const want = process.env.GEMINI_MODEL || 'gemini-2.0-flash';

console.log(`GEMINI_API_KEY : ${key ? `설정됨 (길이 ${key.length}, 앞 6자 ${key.slice(0, 6)}…)` : '비어 있음'}`);
console.log(`GEMINI_MODEL   : ${want}\n`);
if (!key) process.exit(1);

// 1) REST 로 모델 목록을 직접 조회 — SDK 를 건너뛰어 키 자체가 유효한지 본다
console.log('1) 사용 가능한 모델 조회');
let usable = [];
try {
  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${key}`);
  const data = await res.json();
  if (!res.ok) {
    console.log(`   실패 ${res.status}: ${data?.error?.message || JSON.stringify(data)}`);
    process.exit(1);
  }
  usable = (data.models || [])
    .filter((m) => (m.supportedGenerationMethods || []).includes('generateContent'))
    .map((m) => m.name.replace('models/', ''));
  console.log(`   총 ${usable.length}개`);
  console.log(`   ${usable.slice(0, 12).join(', ')}${usable.length > 12 ? ' …' : ''}`);
  console.log(`   설정한 "${want}" 사용 가능? ${usable.includes(want) ? '예' : '아니오 ★'}`);
} catch (e) {
  console.log(`   실패: ${e.message}`);
  process.exit(1);
}

// 2) SDK 로 실제 호출
console.log('\n2) 실제 호출 테스트');
const genAI = new GoogleGenerativeAI(key);
const candidates = [want, ...usable.filter((m) => /flash|pro/.test(m) && !/embedding|vision|image|tts/.test(m))];
const tried = new Set();
let winner = null;

for (const name of candidates) {
  if (tried.has(name)) continue;
  tried.add(name);
  try {
    const model = genAI.getGenerativeModel({ model: name });
    const r = await model.generateContent('한 문장으로 인사해줘.');
    const text = r.response.text().trim();
    console.log(`   ${name.padEnd(34)} OK   "${text.slice(0, 40)}"`);
    if (!winner) winner = name;
    if (tried.size >= 5) break;
  } catch (e) {
    console.log(`   ${name.padEnd(34)} 실패  ${e.message.split('\n')[0].slice(0, 90)}`);
  }
}

console.log('');
if (!winner) {
  console.log('사용 가능한 모델이 없습니다. 키 권한을 확인하세요.');
  process.exit(1);
} else if (winner !== want) {
  console.log(`★ server/.env 의 GEMINI_MODEL 을 "${winner}" 로 바꾸세요. (현재 "${want}" 는 동작하지 않음)`);
} else {
  console.log(`설정한 모델 "${want}" 정상 동작.`);
}
