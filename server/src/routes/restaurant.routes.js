import { Router } from 'express';
import { q, one, pool } from '../db/pool.js';
import { auth } from '../middlewares/auth.js';
import { wrap } from '../middlewares/error.js';
import { findNearbyRestaurants, upsertRestaurant } from '../services/restaurant.service.js';
import { withRestaurantPhoto } from '../lib/restaurantPhoto.js';

const r = Router();
r.use(auth);

/**
 * 지도 페이지 — 화면 중심 좌표 기준 주변 음식점 + 밥친구 모집 인원.
 * 우리 DB(v_restaurant_recruiting)를 1차 소스로 쓰고,
 * 결과가 부족하면 카카오 로컬 API 로 보강 후 restaurant 에 캐시한다.
 */
r.get('/', wrap(async (req, res) => {
  const { lat, lng, radius = 1500, keyword = '' } = req.query;
  if (lat === undefined || lng === undefined) {
    return res.status(400).json({ message: 'lat, lng 는 필수입니다.' });
  }
  res.json(await findNearbyRestaurants({ lat, lng, radius, keyword }));
}));

/** 지도 "+버튼" — 카카오 검색 결과를 우리 DB 에 음식점으로 추가 */
r.post('/', wrap(async (req, res) => {
  const id = await upsertRestaurant(req.body);
  res.status(201).json(withRestaurantPhoto(
    await one('SELECT * FROM v_restaurant_recruiting WHERE restaurant_id = :id', { id })));
}));

/** 음식점 배너 — 기본 정보 + 모집 인원 + 밥친구 프로필 미리보기 */
r.get('/:id', wrap(async (req, res) => {
  const info = await one('SELECT * FROM v_restaurant_recruiting WHERE restaurant_id = :id', { id: req.params.id });
  if (!info) return res.status(404).json({ message: '음식점을 찾을 수 없습니다.' });
  const preview = await q(
    'SELECT user_id, nickname, profile_image FROM v_restaurant_buddy WHERE restaurant_id = :id AND user_id <> :me LIMIT 4',
    { id: req.params.id, me: req.user.id });
  res.json({ ...withRestaurantPhoto(info), preview });
}));

/** 음식점별 밥친구 목록 페이지 (+ 취향 일치율) */
r.get('/:id/buddies', wrap(async (req, res) => {
  const rows = await q(
    `SELECT b.*, fn_taste_match_rate(:me, b.user_id) AS match_rate,
            (SELECT GROUP_CONCAT(i.name ORDER BY ui.slot)
               FROM user_interest ui JOIN interest i ON i.id = ui.interest_id
              WHERE ui.user_id = b.user_id) AS interests
       FROM v_restaurant_buddy b
      WHERE b.restaurant_id = :id AND b.user_id <> :me
      ORDER BY match_rate DESC`,
    { id: req.params.id, me: req.user.id });
  res.json(rows.map((x) => ({ ...x, interests: x.interests ? x.interests.split(',') : [] })));
}));


export default r;
