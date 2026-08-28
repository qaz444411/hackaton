import { GoogleGenerativeAI } from '@google/generative-ai';
import { config } from '../config.js';
import { FALLBACK_QUESTIONS, ASSISTANT_RULES, buildAssistantSystemPrompt, buildSuggestPrompt, SUGGEST_RULES }
  from './ai.prompts.js';

const FALLBACK = FALLBACK_QUESTIONS;

/**
 * 모델 폴백 목록.
 * 구글이 모델을 수시로 종료해서(2.0-flash / 2.5-flash 는 신규 키에 404),
 * 설정 모델이 404/503 이면 다음 후보로 자동으로 넘어간다.
 * 실제 되는 모델은 `npm run gemini:check` 로 확인할 수 있다.
 */
const MODEL_FALLBACKS = ['gemini-3.6-flash', 'gemini-3-flash-preview', 'gemini-flash-lite-latest'];

/**
 * 다른 모델로 재시도할 가치가 있는 오류인지.
 *  404 종료된 모델 / 503 과부하 / 429 쿼터 초과
 * 429 는 모델마다 쿼터 버킷이 달라서, 한 모델이 막혀도 다른 모델로 넘어가면 대개 통한다.
 */
const shouldTryNextModel = (msg = '') =>
  /404|not found|no longer available|503|UNAVAILABLE|high demand|overloaded|429|quota|RESOURCE_EXHAUSTED|rate limit/i.test(msg);

/** 설정 모델부터 차례로 시도한다 */
async function withModelFallback(genAI, buildModel, run) {
  const order = [config.gemini.model, ...MODEL_FALLBACKS.filter((m) => m !== config.gemini.model)];
  let lastErr = null;
  for (const name of order) {
    try {
      return { result: await run(buildModel(genAI, name)), model: name };
    } catch (e) {
      lastErr = e;
      if (!shouldTryNextModel(e.message)) throw e;
      console.warn(`gemini: ${name} 사용 불가 → 다음 모델 시도 (${e.message.split('\n')[0].slice(0, 80)})`);
    }
  }
  throw lastErr;
}

/** 키가 없을 때 화면에 그대로 보여줄 안내 (조용히 죽지 않게) */
const NO_KEY_MESSAGE =
  'AI 도우미를 쓰려면 제미나이 API 키가 필요해요.\n' +
  'server/.env 의 GEMINI_API_KEY 에 키를 넣고 서버를 재시작하면 바로 대화할 수 있어요.\n' +
  '키는 https://aistudio.google.com/apikey 에서 무료로 발급받을 수 있어요.';

/**
 * 홈 화면 AI 도우미 — 자유 대화.
 * history 는 [{ role: 'user'|'model', text }] 형태. 원문 채팅 내용은 넘기지 않는다.
 */
export async function chatWithAssistant({ history = [], message, context = {} }) {
  if (!config.gemini.key) {
    return { reply: NO_KEY_MESSAGE, source: 'NO_KEY' };
  }
  try {
    const genAI = new GoogleGenerativeAI(config.gemini.key);
    const systemInstruction = buildAssistantSystemPrompt(ASSISTANT_RULES, context);

    // 제미나이는 첫 턴이 반드시 user 여야 한다 — 앞쪽 model 턴은 잘라낸다
    const clean = [...history];
    while (clean.length && clean[0].role !== 'user') clean.shift();
    const turns = clean.slice(-12).map((m) => ({
      role: m.role === 'model' ? 'model' : 'user',
      parts: [{ text: String(m.text).slice(0, 1000) }],
    }));

    const { result } = await withModelFallback(
      genAI,
      (ai, name) => ai.getGenerativeModel({
        model: name,
        generationConfig: { temperature: 0.9, maxOutputTokens: 800 },
        systemInstruction,
      }),
      (model) => model.startChat({ history: turns }).sendMessage(message),
    );

    const reply = result.response.text()?.trim();
    if (!reply) return { reply: '잠시 생각이 멈췄어요. 다시 한 번 물어봐 주시겠어요?', source: 'FALLBACK' };
    return { reply, source: 'GEMINI' };
  } catch (e) {
    console.error('gemini assistant error', e.message);
    // 원인별로 사용자에게 실제로 도움이 되는 문구를 준다
    const msg = /API key not valid|API_KEY_INVALID/i.test(e.message)
      ? 'GEMINI_API_KEY 가 올바르지 않아요. server/.env 의 키를 다시 확인해 주세요.'
      : /quota|RESOURCE_EXHAUSTED|429/i.test(e.message)
        ? '오늘 무료 사용량을 다 쓴 것 같아요. 잠시 후 다시 시도해 주세요.'
        : 'AI 도우미가 잠시 응답하지 못했어요. 잠시 후 다시 시도해 주세요.';
    return { reply: msg, source: 'ERROR' };
  }
}

/**
 * 제미나이 챗봇 API — 채팅 상세 페이지의 "대화 주제 추천".
 * 사용자 메시지 원문은 보내지 않고, 공통 관심사/음식 종류/식당명만 넘긴다(개인정보 최소화).
 */
export async function suggestQuestions(ctx = {}) {
  if (!config.gemini.key) return { questions: FALLBACK, source: 'FALLBACK' };
  try {
    const genAI = new GoogleGenerativeAI(config.gemini.key);
    const prompt = buildSuggestPrompt(ctx);

    const { result } = await withModelFallback(
      genAI,
      (ai, name) => ai.getGenerativeModel({
        model: name,
        generationConfig: { temperature: 1.0, responseMimeType: 'application/json' },
        systemInstruction: SUGGEST_RULES,
      }),
      (model) => model.generateContent(prompt),
    );
    const parsed = JSON.parse(result.response.text());
    const questions = (parsed.questions || []).slice(0, 3).filter(Boolean);
    return questions.length === 3
      ? { questions, source: 'GEMINI' }
      : { questions: FALLBACK, source: 'FALLBACK' };
  } catch (e) {
    console.error('gemini error', e.message);
    return { questions: FALLBACK, source: 'FALLBACK' };
  }
}
