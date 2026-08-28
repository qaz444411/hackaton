import 'dotenv/config';

/**
 * 허용할 프론트 오리진 목록.
 * 쉼표로 여러 개를 넣을 수 있다 (http 와 https 를 함께 열어둘 때 쓴다).
 *   CLIENT_ORIGIN=https://a.example.com,http://1.2.3.4
 *
 * 브라우저가 보내는 Origin 헤더에는 뒤에 슬래시가 없으므로 여기서도 떼어낸다.
 * cors 미들웨어와 Socket.IO 둘 다 배열을 그대로 받는다.
 */
const clientOrigins = (process.env.CLIENT_ORIGIN || 'http://localhost:5173')
  .split(',')
  .map((s) => s.trim().replace(/\/+$/, ''))
  .filter(Boolean);

export const config = {
  port: Number(process.env.PORT || 4000),
  clientOrigin: clientOrigins,
  db: {
    host: process.env.DB_HOST, port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER, password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
  },
  jwt: { secret: process.env.JWT_SECRET, expiresIn: process.env.JWT_EXPIRES || '7d' },
  kakaoKey: process.env.KAKAO_REST_API_KEY,

  /** 어느 AI 를 쓸지. 'gemini' | 'bedrock' — 되돌릴 수 있게 둘 다 남겨둔다. */
  ai: { provider: (process.env.AI_PROVIDER || 'gemini').trim().toLowerCase() },

  gemini: { key: process.env.GEMINI_API_KEY, model: process.env.GEMINI_MODEL || 'gemini-2.0-flash' },

  bedrock: {
    // 반드시 global. 접두사가 붙은 추론 프로파일이어야 한다.
    // raw ID 로 부르면 "on-demand throughput isn't supported" 가 난다.
    modelId: process.env.BEDROCK_MODEL_ID || 'global.anthropic.claude-sonnet-5',
    // 표시·진단용으로만 읽는다. SDK 에 직접 넘기지 않는다 —
    // 리전은 코드가 정하지 않고 환경변수(AWS_REGION/AWS_DEFAULT_REGION)나
    // EC2 가 있는 리전을 그대로 따라가야 한다.
    region: process.env.AWS_REGION || process.env.AWS_DEFAULT_REGION || null,
  },
};
