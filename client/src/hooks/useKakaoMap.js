import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * 카카오 지도 SDK 로더 + 지도 인스턴스 훅.
 * ─ 스크립트 태그는 index.html 에 있고(autoload=false), 여기서 kakao.maps.load 로 초기화한다.
 * ─ 프론트는 JavaScript 키만 사용(VITE_KAKAO_JS_KEY). 장소 검색은 서버 프록시(/api/restaurants)를 쓴다.
 */

/** 지도 기본 중심 — 위치 권한을 못 받았을 때만 쓰는 폴백 (군산) */
export const FALLBACK_CENTER = { lat: 35.9675, lng: 126.7370 };

/* ------------------------------------------------------------------ */
/* 위치 권한                                                           */
/* ------------------------------------------------------------------ */

/**
 * 위치 상태.
 *  idle        아직 요청 안 함
 *  locating    권한 창 떠 있음 / 측위 중
 *  granted     좌표 확보
 *  denied      사용자가 거부  → 설정에서 직접 켜야 함
 *  insecure    https 가 아니라 브라우저가 아예 차단 (모바일에서 가장 흔한 원인)
 *  unavailable 기기가 위치를 못 잡음 / 타임아웃
 */
export const GEO = {
  IDLE: 'idle', LOCATING: 'locating', GRANTED: 'granted',
  DENIED: 'denied', INSECURE: 'insecure', UNAVAILABLE: 'unavailable',
};

export const GEO_MESSAGE = {
  [GEO.LOCATING]: '현재 위치를 찾는 중…',
  [GEO.DENIED]: '위치 권한이 거부됐어요. 브라우저 주소창의 자물쇠 → 권한에서 위치를 허용해 주세요.',
  [GEO.INSECURE]: 'http 접속이라 브라우저가 위치 기능을 막았어요. https 주소로 열어야 현재 위치를 쓸 수 있어요.',
  [GEO.UNAVAILABLE]: '현재 위치를 찾지 못했어요. 잠시 후 다시 시도해 주세요.',
};

/**
 * 현재 위치 훅.
 * watch=true 면 이동을 따라가며 갱신한다(지도에서 내 점이 따라 움직임).
 */
export function useMyLocation({ auto = true, watch = true } = {}) {
  const [pos, setPos] = useState(null);           // { lat, lng, accuracy }
  const [state, setState] = useState(GEO.IDLE);
  const watchId = useRef(null);

  const request = useCallback(() => {
    // https(또는 localhost)가 아니면 getCurrentPosition 이 콜백조차 부르지 않는 브라우저가 있다.
    // 조용히 실패하면 원인을 못 찾으므로 먼저 걸러서 상태로 알린다.
    if (typeof window !== 'undefined' && !window.isSecureContext) {
      setState(GEO.INSECURE);
      return;
    }
    if (!navigator.geolocation) {
      setState(GEO.UNAVAILABLE);
      return;
    }

    setState((s) => (s === GEO.GRANTED ? s : GEO.LOCATING));

    const ok = (p) => {
      setPos({ lat: p.coords.latitude, lng: p.coords.longitude, accuracy: p.coords.accuracy });
      setState(GEO.GRANTED);
    };
    const fail = (err) => {
      // 1 = PERMISSION_DENIED, 2 = POSITION_UNAVAILABLE, 3 = TIMEOUT
      setState(err.code === 1 ? GEO.DENIED : GEO.UNAVAILABLE);
    };
    const opts = { enableHighAccuracy: true, timeout: 10000, maximumAge: 15000 };

    navigator.geolocation.getCurrentPosition(ok, fail, opts);

    if (watch && watchId.current === null) {
      watchId.current = navigator.geolocation.watchPosition(ok, fail, opts);
    }
  }, [watch]);

  useEffect(() => {
    if (auto) request();
    return () => {
      if (watchId.current !== null) {
        navigator.geolocation.clearWatch(watchId.current);
        watchId.current = null;
      }
    };
  }, [auto, request]);

  return { pos, state, request, isReady: state === GEO.GRANTED };
}

/* ------------------------------------------------------------------ */
/* 지도                                                                */
/* ------------------------------------------------------------------ */

export function useKakaoMap({ center = FALLBACK_CENTER, level = 4 } = {}) {
  const containerRef = useRef(null);
  const mapRef = useRef(null);
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let timer = null;
    let waited = 0;

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
      // SDK 로드 대기. 키가 없거나 도메인 미등록이면 영영 안 오므로 10초 뒤 포기하고 알린다.
      timer = setInterval(() => {
        waited += 100;
        if (window.kakao?.maps) { clearInterval(timer); init(); }
        else if (waited >= 10000) { clearInterval(timer); setFailed(true); }
      }, 100);
    }
    return () => { if (timer) clearInterval(timer); };
  }, []);

  /** 현재 지도 중심 좌표 (음식점 조회 파라미터) */
  const getCenter = useCallback(() => {
    const c = mapRef.current?.getCenter();
    return c ? { lat: c.getLat(), lng: c.getLng() } : center;
  }, [center]);

  const panTo = useCallback((lat, lng) => {
    mapRef.current?.panTo(new window.kakao.maps.LatLng(lat, lng));
  }, []);

  const setCenter = useCallback((lat, lng) => {
    mapRef.current?.setCenter(new window.kakao.maps.LatLng(lat, lng));
  }, []);

  /** 화면에 실제로 보이는 범위의 반경(m) — 조회 radius 를 화면과 맞춘다 */
  const getRadius = useCallback(() => {
    const map = mapRef.current;
    if (!map) return 1500;
    const b = map.getBounds();
    if (!b) return 1500;
    const ne = b.getNorthEast();
    const c = map.getCenter();
    // 중심 → 북동쪽 모서리 거리 (하버사인)
    const R = 6371000;
    const toRad = (d) => (d * Math.PI) / 180;
    const dLat = toRad(ne.getLat() - c.getLat());
    const dLng = toRad(ne.getLng() - c.getLng());
    const a = Math.sin(dLat / 2) ** 2 +
      Math.cos(toRad(c.getLat())) * Math.cos(toRad(ne.getLat())) * Math.sin(dLng / 2) ** 2;
    const d = 2 * R * Math.asin(Math.min(1, Math.sqrt(a)));
    return Math.max(300, Math.min(20000, Math.round(d)));
  }, []);

  return { containerRef, map: mapRef, ready, failed, getCenter, getRadius, panTo, setCenter };
}

/* ------------------------------------------------------------------ */
/* 오버레이 렌더 헬퍼                                                   */
/* ------------------------------------------------------------------ */

/**
 * 핀 렌더.
 * items 는 종류에 상관없이 아래 모양으로 정규화해서 넘긴다.
 *   { key, kind: 'restaurant'|'spot', lat, lng, label, count, isPopular }
 * 반환값은 정리 함수(cleanup).
 */
export function renderPins(map, items, onSelect) {
  const overlays = items.map((it) => {
    const el = document.createElement('div');
    el.className = `map-pin map-pin--${it.kind}${it.count > 0 ? ' is-recruiting' : ''}`;
    // 아이콘은 호출부가 정한다(음식 종류별). 없으면 종류 기본값.
    const icon = it.icon || (it.kind === 'spot' ? '📍' : '🍽');
    const count = it.count > 0
      ? `<b class="map-pin__count">${it.count}</b>`
      : '';
    el.innerHTML = `<span class="map-pin__icon">${icon}</span>
                    <span class="map-pin__label">${escapeHtml(it.label)}</span>${count}`;
    el.onclick = (e) => { e.stopPropagation(); onSelect(it); };

    const ov = new window.kakao.maps.CustomOverlay({
      position: new window.kakao.maps.LatLng(it.lat, it.lng),
      content: el,
      yAnchor: 1,
      zIndex: it.count > 0 ? 3 : 2,
    });
    ov.setMap(map);
    return ov;
  });
  return () => overlays.forEach((o) => o.setMap(null));
}

/**
 * 핀이 많을 때 겹치지 않게 묶어 보여준다.
 * index.html 에서 clusterer 라이브러리를 이미 로드하고 있다(libraries=services,clusterer).
 *
 * 카카오 클러스터러는 Marker 만 묶을 수 있고 CustomOverlay 는 못 묶는다.
 * 그래서 축소 상태에서는 클러스터(숫자 원)만 그리고, 확대하면 원래 핀으로 돌아간다.
 * minLevel 보다 확대(레벨이 작음)되면 이 함수는 아무것도 그리지 않는다.
 */
export function renderClusters(map, items, { minLevel = 6, onZoomIn } = {}) {
  if (!map || !window.kakao?.maps?.MarkerClusterer) return () => {};
  if (map.getLevel() < minLevel || !items.length) return () => {};

  const markers = items.map((it) => new window.kakao.maps.Marker({
    position: new window.kakao.maps.LatLng(it.lat, it.lng),
  }));

  const clusterer = new window.kakao.maps.MarkerClusterer({
    map,
    markers,
    gridSize: 60,
    averageCenter: true,
    minClusterSize: 2,
    disableClickZoom: true,
    styles: [{
      width: '38px', height: '38px',
      background: 'rgba(255,107,74,.92)',
      borderRadius: '19px',
      color: '#fff', textAlign: 'center', lineHeight: '38px',
      fontSize: '14px', fontWeight: '800',
      border: '2px solid #fff',
      boxShadow: '0 4px 12px rgba(0,0,0,.2)',
    }],
  });

  // 클러스터를 누르면 그 영역으로 확대해 개별 핀을 보여준다
  const handler = (cluster) => {
    map.setLevel(Math.max(1, map.getLevel() - 2), { anchor: cluster.getCenter() });
    onZoomIn?.();
  };
  window.kakao.maps.event.addListener(clusterer, 'clusterclick', handler);

  return () => {
    window.kakao.maps.event.removeListener(clusterer, 'clusterclick', handler);
    clusterer.clear();
    clusterer.setMap(null);
  };
}

/** 내 위치 점 + 정확도 원 */
export function renderMyLocation(map, pos) {
  if (!pos) return () => {};
  const el = document.createElement('div');
  el.className = 'my-dot';

  const dot = new window.kakao.maps.CustomOverlay({
    position: new window.kakao.maps.LatLng(pos.lat, pos.lng),
    content: el, yAnchor: 0.5, xAnchor: 0.5, zIndex: 5,
  });
  dot.setMap(map);

  // 정확도가 아주 나쁠 때(수백 m) 원이 화면을 덮지 않도록 상한을 둔다
  const circle = new window.kakao.maps.Circle({
    center: new window.kakao.maps.LatLng(pos.lat, pos.lng),
    radius: Math.min(pos.accuracy || 30, 300),
    strokeWeight: 1, strokeColor: '#2C7BE5', strokeOpacity: 0.5,
    fillColor: '#2C7BE5', fillOpacity: 0.12,
  });
  circle.setMap(map);

  return () => { dot.setMap(null); circle.setMap(null); };
}

/**
 * 지도 롱프레스 → 좌표.  "여기서 먹고싶어요" 마커를 찍는 입력.
 *
 * 카카오 SDK 의 rightclick 이벤트는 모바일에서 기기별로 안 오는 경우가 있어
 * 컨테이너의 포인터 이벤트로 직접 구현한다.
 *  · 550ms 유지 + 10px 이내 움직임 → 롱프레스 성립 (지도 드래그와 구분)
 *  · 화면 좌표 → 위경도 변환은 map.getProjection().coordsFromContainerPoint
 */
export function attachLongPress(map, container, onLongPress, { delay = 550, slop = 10 } = {}) {
  if (!map || !container) return () => {};

  let timer = null;
  let start = null;

  const clear = () => {
    if (timer) { clearTimeout(timer); timer = null; }
    start = null;
  };

  const point = (e) => {
    const t = e.touches?.[0] ?? e.changedTouches?.[0] ?? e;
    const rect = container.getBoundingClientRect();
    return { x: t.clientX - rect.left, y: t.clientY - rect.top,
             pageX: t.clientX, pageY: t.clientY };
  };

  const down = (e) => {
    // 핀·시트 같은 오버레이 위에서 시작한 제스처는 무시
    if (e.target.closest?.('.map-pin, .sheet, .map-fab, .map-search, .my-dot')) return;
    if (e.button !== undefined && e.button !== 0) return;   // 마우스는 좌클릭만

    const p = point(e);
    start = p;
    timer = setTimeout(() => {
      timer = null;
      const proj = map.getProjection();
      const latlng = proj.coordsFromContainerPoint(new window.kakao.maps.Point(p.x, p.y));
      // 살짝 진동으로 "찍혔다"는 피드백 (지원 기기만)
      navigator.vibrate?.(15);
      onLongPress({ lat: latlng.getLat(), lng: latlng.getLng() });
      start = null;
    }, delay);
  };

  const move = (e) => {
    if (!start) return;
    const p = point(e);
    if (Math.abs(p.pageX - start.pageX) > slop || Math.abs(p.pageY - start.pageY) > slop) clear();
  };

  container.addEventListener('touchstart', down, { passive: true });
  container.addEventListener('touchmove', move, { passive: true });
  container.addEventListener('touchend', clear);
  container.addEventListener('touchcancel', clear);
  container.addEventListener('mousedown', down);
  container.addEventListener('mousemove', move);
  container.addEventListener('mouseup', clear);
  container.addEventListener('mouseleave', clear);

  return () => {
    clear();
    container.removeEventListener('touchstart', down);
    container.removeEventListener('touchmove', move);
    container.removeEventListener('touchend', clear);
    container.removeEventListener('touchcancel', clear);
    container.removeEventListener('mousedown', down);
    container.removeEventListener('mousemove', move);
    container.removeEventListener('mouseup', clear);
    container.removeEventListener('mouseleave', clear);
  };
}

/** 임시 마커(아직 저장 전) — 롱프레스 지점 표시 */
export function renderDraftPin(map, at) {
  if (!at) return () => {};
  const el = document.createElement('div');
  el.className = 'map-pin map-pin--draft';
  el.innerHTML = '<span class="map-pin__icon">📍</span><span class="map-pin__label">여기</span>';
  const ov = new window.kakao.maps.CustomOverlay({
    position: new window.kakao.maps.LatLng(at.lat, at.lng),
    content: el, yAnchor: 1, zIndex: 6,
  });
  ov.setMap(map);
  return () => ov.setMap(null);
}

function escapeHtml(s = '') {
  return String(s).replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
