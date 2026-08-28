/** 미터 → 사람이 읽기 좋은 거리 표시. 1km 미만은 미터, 이상은 소수점 1자리 km. */
export function formatDistance(m) {
  if (m == null) return '';
  return m < 1000 ? `${m}m` : `${(m / 1000).toFixed(1)}km`;
}
