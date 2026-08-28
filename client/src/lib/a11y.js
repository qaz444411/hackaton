/**
 * 발표용 "화면 크게 보기" — 글씨 크기를 사용자별로 저장하고 앱 전체에 적용한다.
 * 기존 페이지 CSS는 하나도 안 건드리고(전부 px 고정값이라 rem 스케일이 안 먹는다),
 * body 전체를 zoom 으로 확대해서 폰 프레임 내부 레이아웃이 안 깨지게 한다
 * (개별 요소를 스케일하면 390px 고정 프레임 안에서 넘치거나 잘린다).
 * 홈 좌측 하단의 작은/큰 "가" 토글 하나로만 켜고 끈다(2단계).
 */
const KEY_PREFIX = 'a11y:';
const DEFAULT_PREFS = { big: false };

// 이 이상 키우면 좁은 화면에서 레이아웃이 깨지기 쉬워 여기서 상한을 둔다(검증된 값).
const BIG_SCALE = 1.3;

export function loadA11y(userId) {
  if (!userId) return DEFAULT_PREFS;
  try {
    const raw = localStorage.getItem(KEY_PREFIX + userId);
    return raw ? { ...DEFAULT_PREFS, ...JSON.parse(raw) } : DEFAULT_PREFS;
  } catch {
    return DEFAULT_PREFS;
  }
}

export function saveA11y(userId, prefs) {
  if (!userId) return;
  try { localStorage.setItem(KEY_PREFIX + userId, JSON.stringify(prefs)); } catch { /* 저장 실패는 무시 */ }
}

export function applyA11y(prefs) {
  // 430px 이하(모바일 모드)에서는 .phone-frame 이 곧 실제 화면 전체(100vw)라서
  // zoom 을 걸면 화면 밖으로 넘쳐 잘린다 — 그 폭에서는 확대를 걸지 않는다.
  // (발표는 노트북/데스크톱 브라우저 창에서 보는 걸 전제로 한 기능이다.)
  const wide = typeof window !== 'undefined' && window.innerWidth > 430;
  document.body.style.zoom = wide && prefs?.big ? String(BIG_SCALE) : '1';
}
