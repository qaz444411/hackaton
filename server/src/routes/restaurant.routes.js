import { Router } from 'express';
import { q, one, pool } from '../db/pool.js';
import { auth } from '../middlewares/auth.js';
import { wrap } from '../middlewares/error.js';
import { searchKakaoPlaces } from '../services/kakao.service.js';

const r = Router();
r.use(auth);

/**
 * 지도 페이지 — 화면 중심 좌표 기준 주변 음식점 + 밥친구 모집 인원.
 * 우리 DB(v_restaurant_recruiting)를 1차 소스로 쓰고,
 * 결과가 부족하면 카카오 로컬 API 로 보강 후 restaurant 에 캐시한다.
 */
r.get('/', wrap(async (req, res) => {
  const { lat, lng, radius = 1500, keyword = '' } = req.query;

  let rows = await q(
    `SELECT v.*,
            ROUND(6371000 * ACOS(LEAST(1,
              COS(RADIANS(:lat)) * COS(RADIANS(v.latitude)) *
              COS(RADIANS(v.longitude) - RADIANS(:lng)) +
              SIN(RADIANS(:lat)) * SIN(RADIANS(v.latitude))))) AS distance_m
       FROM v_restaurant_recruiting v
      WHERE (:kw = '' OR v.name LIKE CONCAT('%', :kw, '%'))
     HAVING distance_m <= :radius
      ORDER BY v.recruiting_count DESC, distance_m ASC
      LIMIT 50`,
    { lat: Number(lat), lng: Number(lng), kw: keyword, radius: Number(radius) });

  if (rows.length < 5) {
    const places = await searchKakaoPlaces({ lat, lng, radius, keyword });
    for (const p of places) await upsertRestaurant(p);
    rows = await q(
      `SELECT v.*,
              ROUND(6371000 * ACOS(LEAST(1,
                COS(RADIANS(:lat)) * COS(RADIANS(v.latitude)) *
                COS(RADIANS(v.longitude) - RADIANS(:lng)) +
                SIN(RADIANS(:lat)) * SIN(RADIANS(v.latitude))))) AS distance_m
         FROM v_restaurant_recruiting v
        WHERE (:kw = '' OR v.name LIKE CONCAT('%', :kw, '%'))
       HAVING distance_m <= :radius
        ORDER BY v.recruiting_count DESC, distance_m ASC LIMIT 50`,
      { lat: Number(lat), lng: Number(lng), kw: keyword, radius: Number(radius) });
  }
  res.json(rows);
}));

/** 지도 "+버튼" — 카카오 검색 결과를 우리 DB 에 음식점으로 추가 */
r.post('/', wrap(async (req, res) => {
  const id = await upsertRestaurant(req.body);
  res.status(201).json(await one('SELECT * FROM v_restaurant_recruiting WHERE restaurant_id = :id', { id }));
}));

/** 음식점 배너 — 기본 정보 + 모집 인원 + 밥친구 프로필 미리보기 */
r.get('/:id', wrap(async (req, res) => {
  const info = await one('SELECT * FROM v_restaurant_recruiting WHERE restaurant_id = :id', { id: req.params.id });
  if (!info) return res.status(404).json({ message: '음식점을 찾을 수 없습니다.' });
  const preview = await q(
    'SELECT user_id, nickname, profile_image FROM v_restaurant_buddy WHERE restaurant_id = :id AND user_id <> :me LIMIT 4',
    { id: req.params.id, me: req.user.id });
  res.json({ ...info, preview });
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

async function upsertRestaurant(p) {
  const [r1] = await pool.execute(
    `INSERT INTO restaurant
       (external_place_id, name, road_address, latitude, longitude, food_type_code,
        rating, category_name, phone, place_url, synced_at)
     VALUES (:ext, :name, :addr, :lat, :lng, :food, :rating, :cat, :phone, :url, NOW())
     ON DUPLICATE KEY UPDATE
       name=VALUES(name), road_address=VALUES(road_address),
       latitude=VALUES(latitude), longitude=VALUES(longitude),
       category_name=VALUES(category_name), phone=VALUES(phone),
       place_url=VALUES(place_url), synced_at=NOW(), id=LAST_INSERT_ID(id)`,
    { ext: p.externalPlaceId ?? null, name: p.name, addr: p.roadAddress ?? null,
      lat: p.latitude, lng: p.longitude, food: p.foodTypeCode || 'KOREAN',
      rating: p.rating ?? null, cat: p.categoryName ?? null, phone: p.phone ?? null,
      url: p.placeUrl ?? null });
  return r1.insertId;
}

export default r;
