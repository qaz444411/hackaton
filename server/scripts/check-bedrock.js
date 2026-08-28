/**
 * Bedrock 연결 진단.
 *
 *   node scripts/check-bedrock.js
 *
 * AccessDeniedException 이 나면 아래 순서로 본다.
 *   1) 리전   — AWS_DEFAULT_REGION 이 배정 리전(us-west-2)인가
 *   2) 모델 ID — global. 접두사가 붙은 추론 프로파일인가
 *   3) 권한   — EC2 인스턴스 프로파일이 인스턴스에 붙어 있는가
 */
import 'dotenv/config';
import { BedrockRuntimeClient, InvokeModelCommand } from '@aws-sdk/client-bedrock-runtime';
import { config } from '../src/config.js';

const line = (k, v) => console.log(`${k.padEnd(22)}: ${v}`);

console.log('');
line('AI_PROVIDER', config.ai.provider);
line('BEDROCK_MODEL_ID', config.bedrock.modelId);
line('리전(환경변수)', config.bedrock.region ?? '(미설정 — SDK 가 IMDS 로 탐색)');
line('global. 접두사', config.bedrock.modelId.startsWith('global.') ? '있음 ✅' : '없음 ⚠ 추론 프로파일이 아니다');
console.log('');

// region 을 넘기지 않는다 — SDK 기본 탐색에 맡긴다
const client = new BedrockRuntimeClient({});

try {
  const resolved = await client.config.region();
  line('SDK 가 고른 리전', resolved);
} catch (e) {
  line('SDK 가 고른 리전', `확인 실패 (${e.message})`);
}

try {
  const creds = await client.config.credentials();
  line('자격증명', `확보됨 (accessKeyId ${String(creds.accessKeyId).slice(0, 5)}…, 만료 ${creds.expiration ?? '없음'})`);
} catch (e) {
  line('자격증명', `실패 — ${e.name}: ${e.message}`);
  console.log('\n인스턴스 프로파일이 붙어 있는지, 컨테이너에서 IMDS 에 닿는지 확인한다.');
  console.log('도커 브리지 네트워크에서는 IMDSv2 hop limit 이 1 이면 토큰을 못 받는다.');
  process.exit(1);
}

console.log('\n실제 호출 테스트');
try {
  const res = await client.send(new InvokeModelCommand({
    modelId: config.bedrock.modelId,
    contentType: 'application/json',
    accept: 'application/json',
    body: JSON.stringify({
      anthropic_version: 'bedrock-2023-05-31',
      max_tokens: 100,
      system: '한국어 존댓말로 한 문장만 답한다.',
      messages: [{ role: 'user', content: '밥친구 앱을 한 문장으로 소개해줘.' }],
    }),
  }));
  const payload = JSON.parse(new TextDecoder().decode(res.body));
  const text = (payload.content || []).filter((b) => b.type === 'text').map((b) => b.text).join('');
  console.log(`  OK   "${text.trim()}"`);
  console.log(`  토큰 입력 ${payload.usage?.input_tokens} / 출력 ${payload.usage?.output_tokens}`);
  console.log('\nBedrock 정상 동작.');
} catch (e) {
  console.log(`  실패  ${e.name}: ${e.message}`);
  if (/AccessDenied/i.test(e.name + e.message)) {
    console.log('\n점검 순서');
    console.log('  1) 리전   — 현재', config.bedrock.region, '(배정 리전과 같아야 한다)');
    console.log('  2) 모델 ID — 현재', config.bedrock.modelId, '(global. 접두사 필요)');
    console.log('  3) 권한   — 인스턴스 프로파일에 bedrock:InvokeModel 이 있는지');
  }
  process.exit(1);
}
