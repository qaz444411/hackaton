import { Router } from 'express';
import { z } from 'zod';
import { q, one, pool } from '../db/pool.js';
import { auth } from '../middlewares/auth.js';
import { wrap } from '../middlewares/error.js';
import { reverseGeocode } from '../services/kakao.service.js';

const r = Router();
r.use(auth);

/** 하버사인 거리(m) — restaurant.routes.js 와 같은 식 */
const DISTANCE = `ROUND(6371000 * ACOS(LEAST(1,
  COS(RADIANS(:lat)) * COS(RADIANS(v.latitude)) *
  COS(RADIANS(v.longitude) - RADIANS(:lng)) +
  SIN(RADIANS(:lat)) * SIN(RADIANS(v.latitude)))))`;

/**
 * 지도 — 내 주변의 "여기서 먹고싶어요" 마커 목록.
 * 식당 핀(/api/restaurants)과 같은 좌표계로 그려지도록 모양을 맞춰 둔다.
 */
r.get('/', wrap(async (req, res) => {
  const { lat, lng, radius = 2000 } = req.query;
  if (lat === undefined || lng === undefined) {
    return res.status(400).json({ message: 'lat, lng 는 필수입니다.' });
  }

  const rows = await q(
    `SELECT v.*, ${DISTANCE} AS distance_m
       FROM v_spot_recruiting v
      HAVING distance_m <= :radius
      ORDER BY v.recruiting_count DESC, distance_m ASC
      LIMIT 100`,
    { lat: Number(lat), lng: Number(lng), radius: Number(radius) });

  res.json(rows);
}));

/**
 * 지도 롱프레스 → 마커 생성.
 * 마커만 만들고 모집은 아직 시작하지 않는다(취향 선택 후 /matching/draft 에서 SPOT 으로 시작).
 * 아주 가까운(15m 이내) 같은 지점이 이미 있으면 새로 만들지 않고 그걸 돌려준다 — 핀 난립 방지.
 */
r.post('/', wrap(async (req, res) => {
  const b = z.object({
    label: z.string().trim().min(1, '한 글자 이상 입력해 주세요').max(100),
    lat: z.number().min(-90).max(90),
    lng: z.number().min(-180).max(180),
    address: z.string().max(255).nullish(),
  }).parse(req.body);

  const near = await one(
    `SELECT v.*, ${DISTANCE} AS distance_m
       FROM v_spot_recruiting v
      WHERE v.label = :label
      HAVING distance_m <= 15
      ORDER BY distance_m LIMIT 1`,
    { lat: b.lat, lng: b.lng, label: b.label });
  if (near) return res.status(200).json(near);

  // 주소는 있으면 좋고 없어도 그만 — 카카오 REST 키가 없으면 조용히 null
  const address = b.address ?? await reverseGeocode(b.lat, b.lng);

  const [ins] = await pool.execute(
    `INSERT INTO map_spot (created_by, label, latitude, longitude, address)
     VALUES (:u, :label, :lat, :lng, :addr)`,
    { u: req.user.id, label: b.label, lat: b.lat, lng: b.lng, addr: address });

  res.status(201).json(
    await one('SELECT * FROM v_spot_recruiting WHERE spot_id = :id', { id: ins.insertId }));
}));

/** 마커 탭 → 배너에 띄울 상세 + 참여자 미리보기 */
r.get('/:id', wrap(async (req, res) => {
  const info = await one('SELECT * FROM v_spot_recruiting WHERE spot_id = :id', { id: req.params.id });
  if (!info) return res.status(404).json({ message: '해당 지점을 찾을 수 없습니다.' });

  const preview = await q(
    'SELECT user_id, nickname, profile_image FROM v_spot_buddy WHERE spot_id = :id LIMIT 4',
    { id: req.params.id });

  res.json({ ...info, preview });
}));

/** 지점별 밥친구 목록 (+ 취향 일치율) — 식당 버전과 동일한 응답 모양 */
r.get('/:id/buddies', wrap(async (req, res) => {
  const rows = await q(
    `SELECT b.*, fn_taste_match_rate(:me, b.user_id) AS match_rate,
            (SELECT GROUP_CONCAT(i.name ORDER BY ui.slot)
               FROM user_interest ui JOIN interest i ON i.id = ui.interest_id
              WHERE ui.user_id = b.user_id) AS interests
       FROM v_spot_buddy b
      WHERE b.spot_id = :id AND b.user_id <> :me
      ORDER BY match_rate DESC`,
    { id: req.params.id, me: req.user.id });

  res.json(rows.map((x) => ({ ...x, interests: x.interests ? x.interests.split(',') : [] })));
}));

export default r;
