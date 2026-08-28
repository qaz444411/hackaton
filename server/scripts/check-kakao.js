/**
 * 카카오 로컬 API 연결 점검 — node scripts/check-kakao.js
 * 키가 살아 있는지, 수집·캐시가 실제로 되고 있는지 실측한다.
 */
import 'dotenv/config';
import mysql from 'mysql2/promise';
import { searchKakaoPlaces, reverseGeocode } from '../src/services/kakao.service.js';

const has = !!process.env.KAKAO_REST_API_KEY;
console.log(`KAKAO_REST_API_KEY: ${has ? '설정됨' : '비어 있음'}\n`);
if (!has) process.exit(1);

// 서울시청 — 음식점이 확실히 많은 좌표
const at = { lat: 37.5665, lng: 126.9780 };

const places = await searchKakaoPlaces({ ...at, radius: 500 });
console.log(`장소 검색: ${places.length}건`);
if (places.length) {
  console.table(places.slice(0, 5).map((p) => ({
    이름: p.name, 종류: p.foodTypeCode, 거리: p.distance, 평점: p.rating ?? '(API 미제공)',
  })));
}

const addr = await reverseGeocode(at.lat, at.lng);
console.log(`좌표→주소: ${addr ?? '(실패)'}\n`);

const conn = await mysql.createConnection({
  host: process.env.DB_HOST, port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER, password: process.env.DB_PASSWORD, database: process.env.DB_NAME,
});
const [[stat]] = await conn.query(`
  SELECT COUNT(*) 총건수,
         SUM(external_place_id IS NOT NULL) 카카오출처,
         SUM(rating IS NOT NULL)            평점있음,
         SUM(place_url IS NOT NULL)         상세링크,
         MAX(synced_at)                     마지막수집
    FROM restaurant`);
console.log('restaurant 캐시 상태:', stat);

const [sample] = await conn.query(
  'SELECT name, food_type_code, road_address FROM restaurant ORDER BY id DESC LIMIT 5');
console.table(sample);

await conn.end();
