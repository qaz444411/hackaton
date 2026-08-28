import { config } from '../config.js';

/**
 * 카카오 로컬 API — 키워드/카테고리 장소 검색.
 * REST 키는 절대 프론트로 내보내지 않고 이 서버 프록시에서만 쓴다.
 * (프론트는 지도 표시용 JavaScript 키만 사용)
 */
const KAKAO_URL = 'https://dapi.kakao.com/v2/local/search';

const CATEGORY_TO_FOOD = [
  [/한식/, 'KOREAN'], [/일식|초밥|돈까스/, 'JAPANESE'],
  [/중식/, 'CHINESE'], [/양식|이탈리|피자|파스타/, 'WESTERN'],
];

export function mapFoodType(categoryName = '') {
  for (const [re, code] of CATEGORY_TO_FOOD) if (re.test(categoryName)) return code;
  return 'KOREAN';
}

const headers = () => ({ Authorization: `KakaoAK ${config.kakaoKey}` });

function toPlace(d) {
  return {
    externalPlaceId: d.id,
    name: d.place_name,
    roadAddress: d.road_address_name || d.address_name,
    latitude: Number(d.y),
    longitude: Number(d.x),
    categoryName: d.category_name,
    foodTypeCode: mapFoodType(d.category_name),
    phone: d.phone || null,
    placeUrl: d.place_url,
    distance: d.distance ? Number(d.distance) : null,
    // 주의: 카카오 로컬 API 는 평점/리뷰수를 제공하지 않는다.
    // rating 은 항상 null 로 들어가며, "인기" 판정은 v_restaurant_recruiting.is_popular
    // (모집 3명 이상)으로 대신한다. 상세 평점이 필요하면 placeUrl 로 카카오맵을 연다.
  };
}

/**
 * 주변 음식점 검색. 한 페이지 15건이라 pages 만큼 이어서 받는다(최대 3페이지 = 45건).
 * 카테고리 FD6 = 음식점.
 */
export async function searchKakaoPlaces({ lat, lng, radius = 1500, keyword = '', pages = 3 }) {
  if (!config.kakaoKey) return [];

  const base = keyword
    ? `${KAKAO_URL}/keyword.json?query=${encodeURIComponent(keyword)}&x=${lng}&y=${lat}&radius=${radius}&category_group_code=FD6&size=15`
    : `${KAKAO_URL}/category.json?category_group_code=FD6&x=${lng}&y=${lat}&radius=${radius}&size=15&sort=distance`;

  const out = [];
  for (let page = 1; page <= pages; page++) {
    const res = await fetch(`${base}&page=${page}`, { headers: headers() });
    if (!res.ok) {
      console.error('kakao search error', res.status, await res.text());
      break;
    }
    const data = await res.json();
    out.push(...(data.documents || []).map(toPlace));
    if (data.meta?.is_end) break;
  }
  return out;
}

/**
 * 좌표 → 주소 (지도에 찍은 마커의 주소 표시용).
 * 키가 없거나 실패하면 null — 주소는 부가 정보라 흐름을 막지 않는다.
 */
export async function reverseGeocode(lat, lng) {
  if (!config.kakaoKey) return null;
  try {
    const res = await fetch(
      `https://dapi.kakao.com/v2/local/geo/coord2address.json?x=${lng}&y=${lat}`,
      { headers: headers() });
    if (!res.ok) return null;
    const d = (await res.json()).documents?.[0];
    return d?.road_address?.address_name || d?.address?.address_name || null;
  } catch {
    return null;
  }
}
