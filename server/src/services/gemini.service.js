import { GoogleGenerativeAI } from '@google/generative-ai';
import { config } from '../config.js';

const FALLBACK = [
  '오늘 이 식당 처음 가보시는 거예요?',
  '평소에 매운 음식 잘 드시는 편이에요?',
  '요즘 제일 자주 하는 취미가 뭐예요?',
];

/**
 * 제미나이 챗봇 API — 채팅 상세 페이지의 "대화 주제 추천".
 * 사용자 메시지 원문은 보내지 않고, 공통 관심사/음식 종류/식당명만 넘긴다(개인정보 최소화).
 */
export async function suggestQuestions(ctx = {}) {
  if (!config.gemini.key) return { questions: FALLBACK, source: 'FALLBACK' };
  try {
    const genAI = new GoogleGenerativeAI(config.gemini.key);
    const model = genAI.getGenerativeModel({
      model: config.gemini.model,
      generationConfig: { temperature: 1.0, responseMimeType: 'application/json' },
      systemInstruction:
        '너는 처음 만나 함께 밥을 먹는 두 사람의 아이스브레이킹을 돕는다. ' +
        '부담 없고 짧은 한국어 존댓말 질문만 만든다. 사생활·외모·연봉 관련 질문은 금지.',
    });
    const prompt = `공통 관심사: ${ctx.common_interests || '없음'}
음식 종류: ${ctx.food_type || '미정'}
식당: ${ctx.restaurant_name || '미정'}
위 정보를 반영한 대화 시작 질문 3개를 JSON 으로만 답해라.
형식: {"questions": ["...", "...", "..."]}`;

    const result = await model.generateContent(prompt);
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
