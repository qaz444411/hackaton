import { useEffect, useRef, useState } from 'react';

/**
 * 카카오 지도 SDK 로더 + 지도 인스턴스 훅.
 * ─ 스크립트 태그는 index.html 에 있고(autoload=false), 여기서 kakao.maps.load 로 초기화한다.
 * ─ 프론트는 JavaScript 키만 사용(VITE_KAKAO_JS_KEY). 장소 검색은 서버 프록시(/api/restaurants)를 쓴다.
 */
export function useKakaoMap({ center = { lat: 35.9675, lng: 126.7370 }, level = 4 } = {}) {
  const containerRef = useRef(null);
  const mapRef = useRef(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const init = () => {
      window.kakao.maps.load(() => {
        if (!containerRef.current || mapRef.current) return;
        mapRef.current = new window.kakao.maps.Map(containerRef.current, {
          center: new window.kakao.maps.LatLng(center.lat, center.lng),
          level,
        });
        setReady(true);
      });
    };
    if (window.kakao?.maps) init();
    else {
      const t = setInterval(() => {
        if (window.kakao?.maps) { clearInterval(t); init(); }
      }, 100);
      return () => clearInterval(t);
    }
  }, []);

  /** 현재 지도 중심 좌표 (음식점 조회 파라미터) */
  const getCenter = () => {
    const c = mapRef.current?.getCenter();
    return c ? { lat: c.getLat(), lng: c.getLng() } : center;
  };

  const panTo = (lat, lng) =>
    mapRef.current?.panTo(new window.kakao.maps.LatLng(lat, lng));

  return { containerRef, map: mapRef, ready, getCenter, panTo };
}

/** 커스텀 오버레이 핀(모집 인원 표시) 렌더 헬퍼 */
export function renderPins(map, restaurants, onSelect) {
  const overlays = restaurants.map((r) => {
    const el = document.createElement('div');
    el.className = 'map-pin';
    el.innerHTML = `${r.is_popular ? '🔥 ' : ''}${r.name} · ${r.recruiting_count}명`;
    el.onclick = () => onSelect(r);
    const ov = new window.kakao.maps.CustomOverlay({
      position: new window.kakao.maps.LatLng(r.latitude, r.longitude),
      content: el,
      yAnchor: 1,
    });
    ov.setMap(map);
    return ov;
  });
  return () => overlays.forEach((o) => o.setMap(null));
}
