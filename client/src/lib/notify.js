/** 브라우저 알림(Notification API) — 권한 요청 + 실제 표시를 한곳에 모은다 */

export const notifySupported = () => typeof window !== 'undefined' && 'Notification' in window;

/** 사용자가 알림 설정을 켤 때 호출 — 브라우저 권한 동의를 직접 물어본다 */
export async function requestNotifyPermission() {
  if (!notifySupported()) return 'unsupported';
  if (Notification.permission === 'granted') return 'granted';
  if (Notification.permission === 'denied') return 'denied';
  try {
    return await Notification.requestPermission();
  } catch {
    return 'denied';
  }
}

/**
 * 실제 알림 표시. 지금 탭이 보이는 중이면(이미 화면에서 보고 있으므로) 띄우지 않는다.
 * 권한이 없거나 지원하지 않으면 조용히 무시한다.
 */
export function showNotification(title, body, { tag, onClick } = {}) {
  if (!notifySupported() || Notification.permission !== 'granted') return;
  if (document.visibilityState === 'visible') return;
  try {
    const n = new Notification(title, { body, tag, icon: '/avatar-default.png' });
    if (onClick) n.onclick = () => { window.focus(); onClick(); n.close(); };
  } catch { /* 일부 브라우저는 백그라운드 스크립트에서만 허용 — 실패해도 앱 동작엔 지장 없음 */ }
}
