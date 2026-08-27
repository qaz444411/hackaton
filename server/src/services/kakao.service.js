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

export async function searchKakaoPlaces({ lat, lng, radius = 1500, keyword = '' }) {
  if (!config.kakaoKey) return [];
  const url = keyword
    ? `${KAKAO_URL}/keyword.json?query=${encodeURIComponent(keyword)}&x=${lng}&y=${lat}&radius=${radius}&category_group_code=FD6&size=15`
    : `${KAKAO_URL}/category.json?category_group_code=FD6&x=${lng}&y=${lat}&radius=${radius}&size=15&sort=distance`;

  const res = await fetch(url, { headers: { Authorization: `KakaoAK ${config.kakaoKey}` } });
  if (!res.ok) {
    console.error('kakao error', res.status, await res.text());
    return [];
  }
  const data = await res.json();
  return (data.documents || []).map((d) => ({
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
  }));
}
