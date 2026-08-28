import { useEffect, useState } from 'react';

/** 값이 delay(ms) 동안 안 바뀌면 그 값을 돌려준다 — 입력할 때마다 검색 API 를 부르지 않기 위함 */
export function useDebouncedValue(value, delay = 300) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return debounced;
}
