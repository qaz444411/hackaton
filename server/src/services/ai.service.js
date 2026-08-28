import { config } from '../config.js';
import * as gemini from './gemini.service.js';
import * as bedrock from './bedrock.service.js';

/**
 * AI 제공자 선택기.
 *
 *   AI_PROVIDER=gemini    (기본값) 제미나이. 지금까지 쓰던 경로 그대로.
 *   AI_PROVIDER=bedrock   AWS Bedrock (Claude). EC2 인스턴스 프로파일로 인증.
 *
 * 두 구현을 모두 남겨두는 이유는 되돌리기 위해서다. Bedrock 이 안 되면
 * .env.production 에서 AI_PROVIDER 를 gemini 로 바꾸고 api 만 재시작하면
 * 코드 변경 없이 즉시 원복된다.
 *
 * 라우트는 항상 이 모듈만 본다. 제공자별 구현을 직접 import 하지 않는다.
 */
const PROVIDERS = { gemini, bedrock };

function impl() {
  const p = PROVIDERS[config.ai.provider];
  if (!p) {
    console.warn(`알 수 없는 AI_PROVIDER='${config.ai.provider}' — gemini 로 처리한다`);
    return gemini;
  }
  return p;
}

export const chatWithAssistant = (args) => impl().chatWithAssistant(args);
export const suggestQuestions = (args) => impl().suggestQuestions(args);

/** 홈 화면 배너용 상태. 제공자마다 "쓸 수 있는 조건"이 다르다. */
export function providerStatus() {
  if (config.ai.provider === 'bedrock') {
    return {
      provider: 'bedrock',
      // 자격증명은 인스턴스 프로파일이 런타임에 가져온다. 미리 알 수 없으므로
      // 설정만으로 판단하고, 실패는 호출 시점에 안내 문구로 나간다.
      enabled: true,
      model: config.bedrock.modelId,
    };
  }
  return {
    provider: 'gemini',
    enabled: !!config.gemini.key,
    model: config.gemini.model,
  };
}
