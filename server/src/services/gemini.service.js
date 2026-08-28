import { GoogleGenerativeAI } from '@google/generative-ai';
import { config } from '../config.js';

const FALLBACK = [
  '오늘 이 식당 처음 가보시는 거예요?',
  '평소에 매운 음식 잘 드시는 편이에요?',
  '요즘 제일 자주 하는 취미가 뭐예요?',
];

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

/** 홈 화면 AI 도우미의 성격·범위 */
const ASSISTANT_RULES = `너는 "랜덤 밥친구" 앱의 AI 도우미다. 처음 보는 사람과 한 끼를 함께할 상대를 찾아주는 앱이다.

역할
- 앱 사용법 안내: 랜덤 매칭, 지도에서 찾기, 지도에 마커 찍기, 보관함(받은 요청), 채팅
- 오늘 뭘 먹을지, 어떤 음식이 당길지 같은 가벼운 상담
- 처음 만나는 사람과의 식사 자리에서 어색하지 않게 대화하는 요령

앱 기능 사실관계 (이 범위 안에서만 안내한다)
- 랜덤 매칭: 홈 > "랜덤 매칭 시작하기" > 음식/대화스타일/시간대/가격대 선택 > 매칭 시작
- 지도 매칭: 홈 > "지도에서 찾기" > 식당 핀을 누르면 그 식당에서 모집 중인 사람이 보인다
- 마커 찍기: 지도를 길게 누르면 "여기서 먹고싶어요" 마커를 남길 수 있다. 식당이 아닌 장소도 가능하다
- 매칭 성사: 상대에게 매칭 요청 > 상대가 수락하면 채팅방이 자동으로 열린다
- 받은 요청은 하단 탭 "보관함"에서 확인한다

말투와 분량
- 한국어 존댓말, 친근하고 짧게. 기본 2~4문장. 목록이 필요하면 3개까지만
- 모르는 건 모른다고 말한다. 앱에 없는 기능을 있다고 지어내지 않는다
- 사생활·외모·연봉·정치·종교 질문은 하지 않는다
- 특정 식당을 실제로 예약해 주거나 상대를 대신 골라줄 수는 없다. 그건 사용자가 화면에서 직접 한다`;

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
    const systemInstruction = `${ASSISTANT_RULES}

지금 사용자 상황 (필요할 때만 자연스럽게 참고한다. 굳이 다 언급하지 않는다)
- 닉네임: ${context.nickname || '알 수 없음'}
- 확정된 약속: ${context.confirmedMatch || '없음'}
- 진행 중인 매칭: ${context.activeMatching || '없음'}
- 안 읽은 매칭 요청: ${context.inboxNewCount ?? 0}건`;

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
        generationConfig: { temperature: 0.9, maxOutputTokens: 512 },
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
    const prompt = `공통 관심사: ${ctx.common_interests || '없음'}
음식 종류: ${ctx.food_type || '미정'}
식당: ${ctx.restaurant_name || '미정'}
위 정보를 반영한 대화 시작 질문 3개를 JSON 으로만 답해라.
형식: {"questions": ["...", "...", "..."]}`;

    const { result } = await withModelFallback(
      genAI,
      (ai, name) => ai.getGenerativeModel({
        model: name,
        generationConfig: { temperature: 1.0, responseMimeType: 'application/json' },
        systemInstruction:
          '너는 처음 만나 함께 밥을 먹는 두 사람의 아이스브레이킹을 돕는다. ' +
          '부담 없고 짧은 한국어 존댓말 질문만 만든다. 사생활·외모·연봉 관련 질문은 금지.',
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
