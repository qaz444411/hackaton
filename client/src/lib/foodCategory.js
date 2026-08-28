/**
 * 지도 상단 필터 / 검색 카테고리 분류.
 * value 는 food_type_code 와 맞춘다(ALL 만 예외).
 * icon 은 lucide-react 아이콘 이름 — 렌더링은 호출부(MapPage)에서 매핑한다.
 */
export const FOOD_FILTERS = [
  { value: 'ALL', label: '전체', icon: 'Utensils' },
  { value: 'KOREAN', label: '한식', icon: 'Soup' },
  { value: 'JAPANESE', label: '일식', icon: 'Fish' },
  { value: 'CHINESE', label: '중식', icon: 'CookingPot' },
  { value: 'WESTERN', label: '양식', icon: 'Pizza' },
  // ETC = 술집/도시락/구내식당처럼 4분류에 안 들어가는 것들 (v7)
  { value: 'ETC', label: '기타', icon: 'UtensilsCrossed' },
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
