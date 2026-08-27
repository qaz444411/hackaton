import { Router } from 'express';
import { q } from '../db/pool.js';
import { wrap } from '../middlewares/error.js';

const r = Router();

/** 취향/기본선택 페이지의 모든 선택지를 한 번에 내려준다 (하드코딩 금지) */
r.get('/', wrap(async (req, res) => {
  const [food, talk, meal, mbti, interest, region] = await Promise.all([
    q('SELECT code, label FROM food_type_code  WHERE is_active ORDER BY sort_order'),
    q('SELECT code, label FROM talk_style_code WHERE is_active ORDER BY sort_order'),
    q('SELECT code, label, start_time, end_time FROM meal_time_code WHERE is_active ORDER BY sort_order'),
    q('SELECT code FROM mbti_code ORDER BY code'),
    q('SELECT id, name FROM interest WHERE is_active ORDER BY id'),
    q('SELECT code, label FROM region_code WHERE is_active ORDER BY sort_order'),
  ]);
  res.json({ food, talk, meal, mbti: mbti.map((m) => m.code), interest, region });
}));

export default r;
