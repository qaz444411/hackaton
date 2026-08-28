import { BedrockRuntimeClient, InvokeModelCommand } from '@aws-sdk/client-bedrock-runtime';
import { config } from '../config.js';
import { FALLBACK_QUESTIONS, ASSISTANT_RULES, buildAssistantSystemPrompt, buildSuggestPrompt, SUGGEST_RULES }
  from './ai.prompts.js';

/**
 * AWS Bedrock (Anthropic Claude) 구현.
 *
 * 제미나이와 요청/응답 구조가 완전히 다르다.
 *   요청  { anthropic_version, max_tokens, system, messages:[{role,content}] }
 *   응답  { content: [{ type:'text', text }] }  ← content[0].text 로 꺼낸다
 *
 * 인증
 *   EC2 인스턴스 프로파일이 처리한다. Access Key 를 코드나 환경변수에 넣지 않는다.
 *   SDK 가 알아서 IMDS 에서 임시 자격증명을 받아온다.
 *
 * 리전
 *   절대 코드에 박지 않는다. SDK 가 AWS_REGION / AWS_DEFAULT_REGION 을 읽고,
 *   그것도 없으면 EC2 가 있는 리전을 따라간다. 배정된 리전 밖은 IAM 이 전부
 *   막아두었기 때문에 다른 리전을 넣으면 100% AccessDenied 가 난다.
 *
 * 모델 ID
 *   반드시 global. 접두사가 붙은 추론 프로파일이어야 한다.
 *   raw ID(anthropic.claude-sonnet-5)로 부르면
 *   "on-demand throughput isn't supported" ValidationException 이 난다.
 */

// region 을 넘기지 않는다 = SDK 의 기본 탐색(환경변수 -> IMDS)에 맡긴다
const client = new BedrockRuntimeClient({});

const ANTHROPIC_VERSION = 'bedrock-2023-05-31';

/** Bedrock 호출 후 텍스트만 꺼낸다 */
async function invoke({ system, messages, maxTokens = 512 }) {
  const res = await client.send(new InvokeModelCommand({
    modelId: config.bedrock.modelId,
    contentType: 'application/json',
    accept: 'application/json',
    // temperature 는 보내지 않는다. claude-sonnet-5 는
    //   ValidationException: `temperature` is deprecated for this model
    // 로 거부한다(실측). 샘플링은 모델 기본값을 쓴다.
    body: JSON.stringify({
      anthropic_version: ANTHROPIC_VERSION,
      max_tokens: maxTokens,
      system,
      messages,
    }),
  }));

  const payload = JSON.parse(new TextDecoder().decode(res.body));
  // Claude 응답은 content 배열이다. text 블록만 이어 붙인다.
  const text = (payload.content || [])
    .filter((b) => b.type === 'text')
    .map((b) => b.text)
    .join('')
    .trim();
  return text;
}

/**
 * 대화 이력을 Claude 형식으로 바꾼다.
 *  - role: model -> assistant
 *  - 첫 턴은 반드시 user (앞쪽 assistant 턴은 잘라낸다)
 *  - 같은 role 이 연속되면 합친다 (Claude 는 교대를 요구한다)
 */
function toClaudeMessages(history = [], message) {
  const clean = [...history];
  while (clean.length && clean[0].role !== 'user') clean.shift();

  const turns = [];
  for (const m of clean.slice(-12)) {
    const role = m.role === 'model' ? 'assistant' : 'user';
    const content = String(m.text).slice(0, 1000);
    const last = turns[turns.length - 1];
    if (last && last.role === role) last.content += `\n${content}`;
    else turns.push({ role, content });
  }

  // 마지막 사용자 메시지를 붙인다. 직전이 user 면 합쳐서 교대를 유지한다.
  const last = turns[turns.length - 1];
  if (last && last.role === 'user') last.content += `\n${message}`;
  else turns.push({ role: 'user', content: message });

  return turns;
}

/** 오류를 사용자에게 실제로 도움이 되는 한국어 문구로 바꾼다 */
function explain(e) {
  const name = e?.name || '';
  const msg = e?.message || '';

  if (/AccessDenied/i.test(name + msg)) {
    return 'AI 도우미 권한이 없어요. 리전(AWS_DEFAULT_REGION)과 모델 ID 의 global. 접두사, '
      + 'EC2 인스턴스 프로파일 권한을 확인해 주세요.';
  }
  if (/CredentialsProviderError|Could not load credentials|TimeoutError/i.test(name + msg)) {
    return 'AWS 자격증명을 가져오지 못했어요. EC2 인스턴스 프로파일이 붙어 있는지 확인해 주세요.';
  }
  if (/ValidationException/i.test(name + msg)) {
    // 원문을 그대로 보여준다. 'temperature is deprecated' 처럼 원인이 구체적인 경우가 많아
    // 엉뚱한 곳(모델 ID 등)을 짚으면 오히려 디버깅이 늦어진다.
    return `모델 요청이 거부됐어요 (${msg}). 모델 ID 가 추론 프로파일(global. 접두사)인지도 확인해 주세요.`;
  }
  if (/Throttling|TooManyRequests/i.test(name + msg)) {
    return '요청이 몰리고 있어요. 잠시 후 다시 시도해 주세요.';
  }
  return 'AI 도우미가 잠시 응답하지 못했어요. 잠시 후 다시 시도해 주세요.';
}

/** 홈 화면 AI 도우미 — 자유 대화 */
export async function chatWithAssistant({ history = [], message, context = {} }) {
  try {
    const reply = await invoke({
      system: buildAssistantSystemPrompt(ASSISTANT_RULES, context),
      messages: toClaudeMessages(history, message),
      maxTokens: 800,
    });
    if (!reply) return { reply: '잠시 생각이 멈췄어요. 다시 한 번 물어봐 주시겠어요?', source: 'FALLBACK' };
    return { reply, source: 'BEDROCK' };
  } catch (e) {
    console.error('bedrock assistant error', e.name, e.message);
    return { reply: explain(e), source: 'ERROR' };
  }
}

/** 채팅방 "대화 주제 추천" — JSON 만 받아서 파싱한다 */
export async function suggestQuestions(ctx = {}) {
  try {
    const text = await invoke({
      system: SUGGEST_RULES,
      messages: [{ role: 'user', content: buildSuggestPrompt(ctx) }],
      maxTokens: 400,
    });

    // Claude 는 JSON 앞뒤에 설명을 붙이는 경우가 있어 첫 객체만 뽑아낸다
    const match = text.match(/\{[\s\S]*\}/);
    const parsed = JSON.parse(match ? match[0] : text);
    const questions = (parsed.questions || []).slice(0, 3).filter(Boolean);
    return questions.length === 3
      ? { questions, source: 'BEDROCK' }
      : { questions: FALLBACK_QUESTIONS, source: 'FALLBACK' };
  } catch (e) {
    console.error('bedrock suggest error', e.name, e.message);
    return { questions: FALLBACK_QUESTIONS, source: 'FALLBACK' };
  }
}
