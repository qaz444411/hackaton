/**
 * 카카오 category_name → 지도 핀 아이콘 / 필터 분류.
 *
 * category_name 예시
 *   "음식점 > 한식 > 국밥 > 육대장"
 *   "음식점 > 일식 > 초밥,롤"
 *   "음식점 > 간식 > 제과,베이커리"
 *
 * 세분류가 앞에서부터 매칭되도록 구체적인 것을 위에 둔다.
 * (예: "육류,고기 > 닭요리" 를 "육류,고기" 보다 먼저 본다)
 */

/** 세분류 → 아이콘. 위에서부터 순서대로 검사한다. */
const RULES = [
  [/초밥|스시|롤/, '🍣'],
  [/회$|회,|해물|생선|조개|횟집/, '🐟'],
  [/삼계탕|닭요리|치킨|통닭/, '🍗'],
  [/족발|보쌈/, '🐷'],
  [/갈비|육류|고기|스테이크/, '🥩'],
  [/국밥|해장국|설렁탕|곰탕/, '🍲'],
  [/국수|칼국수|냉면|면/, '🍜'],
  [/라멘|라면/, '🍜'],
  [/돈까스|돈가스/, '🍛'],
  [/피자/, '🍕'],
  [/파스타|이탈리|스파게티/, '🍝'],
  [/햄버거|버거|패스트푸드/, '🍔'],
  [/제과|베이커리|빵/, '🥐'],
  [/떡볶이|분식|김밥/, '🍢'],
  [/카페|커피|디저트|아이스크림/, '☕'],
  [/술집|호프|요리주점|이자카야|바$/, '🍻'],
  [/중국|중식|딤섬|마라/, '🥟'],
  [/뷔페/, '🍽'],
  [/샐러드|샌드위치/, '🥗'],
  [/쌀국수|아시아|태국|베트남/, '🍲'],
  [/일식/, '🍱'],
  [/양식/, '🍝'],
  [/한식/, '🍚'],
];

/** food_type_code 폴백 (category_name 이 없을 때) */
const BY_FOOD_TYPE = {
  KOREAN: '🍚', JAPANESE: '🍱', CHINESE: '🥟', WESTERN: '🍝', ANY: '🍽',
};

/** 음식점 하나의 아이콘을 고른다 */
export function foodIcon(restaurant = {}) {
  const cat = restaurant.category_name || '';
  for (const [re, icon] of RULES) {
    if (re.test(cat)) return icon;
  }
  return BY_FOOD_TYPE[restaurant.food_type_code] || '🍽';
}

/**
 * 지도 상단 필터.
 * value 는 food_type_code 와 맞춘다(ALL 만 예외).
 */
export const FOOD_FILTERS = [
  { value: 'ALL', label: '전체', icon: '🗺' },
  { value: 'KOREAN', label: '한식', icon: '🍚' },
  { value: 'JAPANESE', label: '일식', icon: '🍱' },
  { value: 'CHINESE', label: '중식', icon: '🥟' },
  { value: 'WESTERN', label: '양식', icon: '🍝' },
];

/** 필터 적용 — ALL 이면 그대로 */
export function applyFoodFilter(list, filter) {
  if (!filter || filter === 'ALL') return list;
  return list.filter((r) => r.food_type_code === filter);
}

/**
 * 카테고리에서 사람이 읽을 짧은 이름을 뽑는다.
 *   "음식점 > 한식 > 국밥 > 육대장" (가게명 "육대장 군산시청점") → "국밥"
 *   "음식점 > 일식 > 초밥,롤"                                  → "초밥,롤"
 *
 * 마지막 조각이 브랜드명인 경우가 있는데, 그때는 가게 이름에 그 단어가 들어 있다.
 * 단계 수로 자르면 3단계 분류("음식점 > 양식 > 피자")의 실제 분류까지 잘려나간다.
 */
export function shortCategory(restaurant = {}) {
  const parts = String(restaurant.category_name || '')
    .split('>')
    .map((s) => s.trim())
    .filter((s) => s && s !== '음식점');
  if (!parts.length) return restaurant.food_type_label || '';

  const last = parts[parts.length - 1];
  const isBrand = parts.length > 1 && String(restaurant.name || '').includes(last);
  return (isBrand ? parts[parts.length - 2] : last) || restaurant.food_type_label || '';
}
