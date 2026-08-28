/**
 * 음식점 사진 — 식당별로 고정된 사진을 붙일 필요는 없고(카카오가 사진을 안 줘서
 * 다 아이콘만 보이던 문제), 음식 종류(food_type_code) 폴더에서 아무거나 하나
 * 랜덤으로 보여주면 된다. 사진은 uploads/restaurant-photos/<CODE>/ 에 통째로
 * 넣어두면 되고(폴더별로 여러 장), 매칭되는 폴더가 없거나 비어 있으면 ETC로
 * 대신한다. restaurant.image_url 이 따로 지정돼 있으면(set-restaurant-image.js
 * 로 등록한 특정 사진) 그게 우선한다 — 이 함수는 그게 없을 때만 쓰인다.
 *
 * uploads/ 는 이미 app.js 의 /api/uploads 정적 서빙이 통째로 커버한다.
 */
import fs from 'fs';
import path from 'path';

const PHOTO_DIR = path.join(import.meta.dirname, '..', '..', 'uploads', 'restaurant-photos');
// 폴더명은 실제로 정리해서 넣어둔 한글 분류명 그대로 쓴다(한식/중식/일식/양식/기타) —
// food_type_code 값을 그 폴더명으로 매핑한다.
const CATEGORY_DIR = { KOREAN: '한식', CHINESE: '중식', JAPANESE: '일식', WESTERN: '양식', ETC: '기타' };
const IMG_RE = /\.(jpe?g|png|webp)$/i;

// 사진을 나중에 추가/교체해도(서버 재시작 없이) 바로 반영되도록 매 호출마다
// 디렉터리를 새로 읽는다 — 식당 몇 개 조회할 때마다 폴더 하나 읽는 정도라 가볍다.
function listPhotos(dirName) {
  try {
    return fs.readdirSync(path.join(PHOTO_DIR, dirName)).filter((f) => IMG_RE.test(f));
  } catch {
    return []; // 폴더가 아직 없어도 그냥 사진 없음으로 취급
  }
}

export function randomRestaurantPhoto(foodTypeCode) {
  let dirName = CATEGORY_DIR[foodTypeCode] || CATEGORY_DIR.ETC;
  let files = listPhotos(dirName);
  if (!files.length && dirName !== CATEGORY_DIR.ETC) {
    dirName = CATEGORY_DIR.ETC;
    files = listPhotos(dirName);
  }
  if (!files.length) return null;
  const f = files[Math.floor(Math.random() * files.length)];
  return `/api/uploads/restaurant-photos/${encodeURIComponent(dirName)}/${encodeURIComponent(f)}`;
}

/** 행 하나(또는 배열)에 image_url 이 비어 있으면 분류 랜덤 사진으로 채운다 */
export function withRestaurantPhoto(row) {
  if (!row) return row;
  return { ...row, image_url: row.image_url || randomRestaurantPhoto(row.food_type_code) };
}

export function withRestaurantPhotos(rows) {
  return rows.map(withRestaurantPhoto);
}
