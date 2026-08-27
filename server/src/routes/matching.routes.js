import { Router } from 'express';
import { z } from 'zod';
import { q, one, pool } from '../db/pool.js';
import { auth } from '../middlewares/auth.js';
import { wrap } from '../middlewares/error.js';
import { findCandidates } from '../services/matching.service.js';

const r = Router();
r.use(auth);

/** 취향 선택 페이지 — 조건 임시 저장(DRAFT). 사용자당 활성 1건이라 있으면 갱신 */
r.post('/draft', wrap(async (req, res) => {
  const b = z.object({
    matchingType: z.enum(['RANDOM', 'MAP']).default('RANDOM'),
    restaurantId: z.number().int().nullable().optional(),
    foodTypeCode: z.string(), talkStyleCode: z.string(), mealTimeCode: z.string(),
    priceMin: z.number().int(), priceMax: z.number().int(),
  }).parse(req.body);

  const active = await one(
    "SELECT id, status FROM matching_request WHERE active_user_id = :u", { u: req.user.id });

  if (active && active.status === 'DRAFT') {
    await q(`UPDATE matching_request
                SET matching_type=:t, restaurant_id=:r, food_type_code=:f, talk_style_code=:ts,
                    meal_time_code=:mt, price_min=:pmin, price_max=:pmax
              WHERE id=:id`,
      { t: b.matchingType, r: b.restaurantId ?? null, f: b.foodTypeCode, ts: b.talkStyleCode,
        mt: b.mealTimeCode, pmin: b.priceMin, pmax: b.priceMax, id: active.id });
    return res.json({ id: active.id, status: 'DRAFT' });
  }
  if (active) return res.status(409).json({ message: '이미 진행 중인 매칭이 있습니다.', id: active.id });

  const [ins] = await pool.execute(
    `INSERT INTO matching_request
       (user_id, matching_type, restaurant_id, food_type_code, talk_style_code, meal_time_code, price_min, price_max)
     VALUES (:u, :t, :r, :f, :ts, :mt, :pmin, :pmax)`,
    { u: req.user.id, t: b.matchingType, r: b.restaurantId ?? null, f: b.foodTypeCode,
      ts: b.talkStyleCode, mt: b.mealTimeCode, pmin: b.priceMin, pmax: b.priceMax });
  res.status(201).json({ id: ins.insertId, status: 'DRAFT' });
}));

/** 매칭 시작하기 → SEARCHING (트리거가 상태 이력까지 기록) */
r.post('/:id/start', wrap(async (req, res) => {
  await q(`UPDATE matching_request SET status='SEARCHING', started_at=NOW()
            WHERE id=:id AND user_id=:u AND status='DRAFT'`,
    { id: req.params.id, u: req.user.id });
  res.json({ ok: true, status: 'SEARCHING' });
}));

/** 매칭 진행 페이지 — 상태 폴링 */
r.get('/current', wrap(async (req, res) => {
  const mr = await one(
    `SELECT mr.*, ft.label AS food_type, ts.label AS talk_style, mt.label AS meal_time
       FROM matching_request mr
       JOIN food_type_code ft ON ft.code=mr.food_type_code
       JOIN talk_style_code ts ON ts.code=mr.talk_style_code
       JOIN meal_time_code mt ON mt.code=mr.meal_time_code
      WHERE mr.active_user_id = :u`, { u: req.user.id });
  if (!mr) return res.json(null);
  const history = await q(
    `SELECT from_status, to_status, changed_at FROM matching_status_history
      WHERE matching_request_id=:id ORDER BY changed_at`, { id: mr.id });
  res.json({ ...mr, history });
}));

/** 매칭 결과 페이지 — 후보 1명(랜덤) 또는 목록 */
r.get('/:id/candidates', wrap(async (req, res) => {
  const rows = await findCandidates(Number(req.params.id), req.user.id, Number(req.query.limit || 10));
  res.json(rows);
}));

/** 뒤로가기/취소 */
r.post('/:id/cancel', wrap(async (req, res) => {
  await q(`UPDATE matching_request SET status='CANCELLED', ended_at=NOW()
            WHERE id=:id AND user_id=:u AND status IN ('DRAFT','SEARCHING')`,
    { id: req.params.id, u: req.user.id });
  res.json({ ok: true });
}));

/** 홈 화면 — 확정 매칭 정보 */
r.get('/home', wrap(async (req, res) => {
  const confirmed = await one(
    'SELECT * FROM v_home_confirmed_match WHERE user_id = :u ORDER BY match_id DESC LIMIT 1',
    { u: req.user.id });
  const inboxNew = await one(
    "SELECT COUNT(*) AS c FROM v_inbox WHERE user_id=:u AND status='PENDING' AND is_new", { u: req.user.id });
  res.json({ confirmedMatch: confirmed, inboxNewCount: inboxNew.c });
}));

export default r;
