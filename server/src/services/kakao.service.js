import { config } from '../config.js';

/**
 * 카카오 로컬 API — 키워드/카테고리 장소 검색.
 * REST 키는 절대 프론트로 내보내지 않고 이 서버 프록시에서만 쓴다.
 * (프론트는 지도 표시용 JavaScript 키만 사용)
 */
const KAKAO_URL = 'https://dapi.kakao.com/v2/local/search';

/**
 * 카카오 category_name → food_type_code.
 *
 * food_type_code 는 5종뿐이다: KOREAN / JAPANESE / CHINESE / WESTERN / ANY.
 * 카카오 분류는 이보다 훨씬 세분화돼 있어(치킨, 패스트푸드, 술집, 분식 …)
 * 어디에 넣을지 명시적으로 정해줘야 한다.
 *
 * 구체적인 규칙을 위에 둔다. 위에서부터 순서대로 검사한다.
 */
const CATEGORY_TO_FOOD = [
  // 양식 — 치킨/패스트푸드/제과를 여기에 넣는다.
  // 카카오는 치킨을 한식 하위가 아니라 최상위 "음식점 > 치킨" 으로 둔다.
  [/치킨|후라이드|BBQ|패스트푸드|버거|피자|파스타|이탈리|스테이크|샌드위치|샐러드|제과|베이커리|양식/, 'WESTERN'],
  // 일식
  [/일식|초밥|스시|롤|돈까스|돈가스|라멘|우동|샤브샤브|텐동/, 'JAPANESE'],
  // 중식
  [/중식|중국|딤섬|마라|양꼬치/, 'CHINESE'],
  // 한식 — 분식(김밥·떡볶이)은 한식으로 본다
  [/한식|분식|김밥|떡볶이|국밥|해장국|칼국수|냉면|족발|보쌈|삼겹|고기|한정식|백반|찌개|국수/, 'KOREAN'],
];

/**
 * 어디에도 안 걸리면 ETC('기타')로 둔다.
 *
 * 예전에는 KOREAN 으로 떨어뜨렸는데, 술집·도시락·구내식당·아시아음식처럼
 * 한식이 아닌 것들이 전부 한식으로 섞여 들어가 필터가 망가졌다(224건 중 43건).
 * 모르면 모른다고 두는 편이 낫다. restaurant 는 ck_restaurant_food 때문에
 * ANY 를 쓸 수 없어서 분류용 코드 ETC 를 따로 뒀다(v7).
 */
export function mapFoodType(categoryName = '') {
  for (const [re, code] of CATEGORY_TO_FOOD) if (re.test(categoryName)) return code;
  return 'ETC';
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
