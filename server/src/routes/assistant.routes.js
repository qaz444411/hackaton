import { Router } from 'express';
import { z } from 'zod';
import { one } from '../db/pool.js';
import { config } from '../config.js';
import { auth } from '../middlewares/auth.js';
import { wrap } from '../middlewares/error.js';
import { chatWithAssistant } from '../services/gemini.service.js';

const r = Router();
r.use(auth);

/** 홈 화면에서 "키가 없다"는 걸 미리 알려주기 위한 상태 조회 */
r.get('/status', wrap(async (req, res) => {
  res.json({ enabled: !!config.gemini.key, model: config.gemini.model });
}));

/** 처음 열었을 때 보여줄 추천 질문 — 사용자 상황에 맞춰 조금씩 다르게 */
r.get('/starters', wrap(async (req, res) => {
  const ctx = await loadContext(req.user.id);
  const starters = ['오늘 뭐 먹을지 못 정하겠어요', '이 앱 어떻게 쓰는 거예요?'];
  starters.push(ctx.confirmedMatch
    ? '처음 만나는데 무슨 얘기하죠?'
    : '지도에 마커 찍는 건 뭔가요?');
  res.json({ starters });
}));

/**
 * AI 도우미 대화.
 * 대화 이력은 클라이언트가 들고 있다가 매번 보낸다(서버 무상태).
 * 다른 사용자와 주고받은 채팅 원문은 절대 여기로 넘기지 않는다.
 */
r.post('/chat', wrap(async (req, res) => {
  const b = z.object({
    message: z.string().trim().min(1, '메시지를 입력해 주세요').max(500),
    history: z.array(z.object({
      role: z.enum(['user', 'model']),
      text: z.string().max(2000),
    })).max(30).default([]),
  }).parse(req.body);

  const context = await loadContext(req.user.id);
  const { reply, source } = await chatWithAssistant({
    history: b.history, message: b.message, context,
  });

  res.json({ reply, source });
}));

/** 답변 품질을 위해 넘기는 최소한의 상황 정보 */
async function loadContext(userId) {
  const me = await one('SELECT nickname FROM users WHERE id = :u', { u: userId });

  const match = await one(
    `SELECT partner_nickname, meal_time, restaurant_name, food_type
       FROM v_home_confirmed_match WHERE user_id = :u ORDER BY match_id DESC LIMIT 1`,
    { u: userId });

  const active = await one(
    `SELECT mr.status, ft.label AS food, mt.label AS meal
       FROM matching_request mr
       JOIN food_type_code ft ON ft.code = mr.food_type_code
       JOIN meal_time_code mt ON mt.code = mr.meal_time_code
      WHERE mr.active_user_id = :u`, { u: userId });

  const inbox = await one(
    "SELECT COUNT(*) AS c FROM v_inbox WHERE user_id=:u AND status='PENDING' AND is_new", { u: userId });

  return {
    nickname: me?.nickname,
    confirmedMatch: match
      ? `${match.partner_nickname}님과 ${match.meal_time}, ${match.restaurant_name || match.food_type}`
      : null,
    activeMatching: active ? `${active.food}/${active.meal} (${active.status})` : null,
    inboxNewCount: inbox?.c ?? 0,
  };
}

export default r;
