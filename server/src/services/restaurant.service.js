import { q, pool } from '../db/pool.js';
import { searchKakaoPlaces } from './kakao.service.js';
import { withRestaurantPhotos } from '../lib/restaurantPhoto.js';

/**
 * 음식점 조회 — 지도 화면과 AI 추천이 함께 쓴다.
 *
 * 우리 DB(v_restaurant_recruiting)를 1차 소스로 쓰고, 결과가 부족하면
 * 카카오 로컬 API 로 보강한 뒤 restaurant 테이블에 캐시한다.
 * 두 곳에서 같은 로직이 필요해 라우트에서 분리했다.
 */

/** 하버사인 거리(m) */
const DISTANCE = `ROUND(6371000 * ACOS(LEAST(1,
  COS(RADIANS(:lat)) * COS(RADIANS(v.latitude)) *
  COS(RADIANS(v.longitude) - RADIANS(:lng)) +
  SIN(RADIANS(:lat)) * SIN(RADIANS(v.latitude)))))`;

function query({ lat, lng, radius, keyword, limit }) {
  return q(
    `SELECT v.*, ${DISTANCE} AS distance_m
       FROM v_restaurant_recruiting v
      WHERE (:kw = '' OR v.name LIKE CONCAT('%', :kw, '%')
             OR v.food_type_label LIKE CONCAT('%', :kw, '%'))
     HAVING distance_m <= :radius
      ORDER BY v.recruiting_count DESC, distance_m ASC
      LIMIT ${Number(limit) || 50}`,
    { lat: Number(lat), lng: Number(lng), kw: keyword || '', radius: Number(radius) });
}

/**
 * 주변 음식점 목록.
 * minRows 보다 적게 나오면 카카오에서 받아와 캐시한 뒤 다시 조회한다.
 */
export async function findNearbyRestaurants({
  lat, lng, radius = 1500, keyword = '', limit = 50, minRows = 5,
} = {}) {
  let rows = await query({ lat, lng, radius, keyword, limit });

  if (rows.length < minRows) {
    const places = await searchKakaoPlaces({ lat, lng, radius, keyword });
    for (const p of places) await upsertRestaurant(p);
    rows = await query({ lat, lng, radius, keyword, limit });
  }
  return withRestaurantPhotos(rows);
}

/** 카카오 검색 결과를 restaurant 에 upsert 하고 id 를 돌려준다 */
export async function upsertRestaurant(p) {
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
