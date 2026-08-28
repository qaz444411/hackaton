import { useState } from 'react';
import { Link } from 'react-router-dom';

/**
 * 임시 QA 화면 — 모든 페이지를 빠르게 훑어보기 위한 테스트용 인덱스.
 * 실제 서비스 플로우에는 노출되지 않고, 확인 끝나면 지워도 되는 화면.
 */
const GROUPS = [
  {
    title: '온보딩',
    items: [
      { label: '시작 (인트로)', to: '/' },
      { label: '로그인', to: '/login' },
      { label: '회원가입', to: '/signup' },
      { label: '회원가입 · 기본선택(MBTI 등)', to: '/signup/profile' },
    ],
  },
  {
    title: '홈 · 매칭',
    items: [
      { label: '홈', to: '/home' },
      { label: '취향 선택', to: '/preference' },
      { label: '매칭 요청(접수)', to: '/matching/:id', dynamic: 'id' },
      { label: '매칭 결과', to: '/matching/:id/result', dynamic: 'id' },
    ],
  },
  {
    title: '지도 · 장소',
    items: [
      { label: '지도', to: '/map' },
      { label: '맛집 리스트', to: '/restaurants' },
      { label: '밥친구 모집하기', to: '/recruit' },
      { label: '밥친구 목록(음식점)', to: '/restaurants/:id/buddies', dynamic: 'id' },
      { label: '밥친구 목록(마커)', to: '/spots/:id/buddies', dynamic: 'id' },
      { label: '보낸 요청 대기', to: '/proposals/:id/wait', dynamic: 'id' },
    ],
  },
  {
    title: '채팅 · 보관함',
    items: [
      { label: '채팅 목록', to: '/chats' },
      { label: '채팅방', to: '/chats/:matchId', dynamic: 'matchId' },
      { label: '보관함', to: '/inbox' },
    ],
  },
  {
    title: '기타',
    items: [
      { label: '마이페이지', to: '/mypage' },
      { label: 'AI 도우미(챗봇)', to: '/assistant' },
    ],
  },
];

export default function DevPreviewPage() {
  const [ids, setIds] = useState({});

  const resolve = (item) => {
    if (!item.dynamic) return item.to;
    const v = (ids[item.to] || '').trim();
    return v ? item.to.replace(`:${item.dynamic}`, v) : null;
  };

  return (
    <div style={{ minHeight: '100%', overflowY: 'auto', padding: '24px 20px 60px', background: '#F6F2E9' }}>
      <h1 style={{ fontSize: 20, fontWeight: 700, color: '#222' }}>화면 모아보기 (테스트용)</h1>
      <p style={{ marginTop: 4, fontSize: 12, color: 'rgba(34,34,34,.6)' }}>
        로그인된 상태에서 각 화면을 빠르게 확인하기 위한 임시 페이지예요. 아이디가 필요한 화면은
        직접 값을 넣고 이동해 주세요.
      </p>

      {GROUPS.map((g) => (
        <section key={g.title} style={{ marginTop: 24 }}>
          <h2 style={{ fontSize: 14, fontWeight: 600, color: '#222', marginBottom: 8 }}>{g.title}</h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {g.items.map((item) => {
              const target = resolve(item);
              return (
                <div key={item.to}
                     style={{
                       display: 'flex', alignItems: 'center', gap: 8,
                       background: '#FFFDF9', borderRadius: 14, padding: '10px 14px',
                       boxShadow: '0 4px 20px rgba(0,0,0,.06)',
                     }}>
                  <span style={{ flex: 1, fontSize: 13, color: '#222' }}>{item.label}</span>
                  {item.dynamic && (
                    <input
                      placeholder={item.dynamic}
                      value={ids[item.to] || ''}
                      onChange={(e) => setIds((prev) => ({ ...prev, [item.to]: e.target.value }))}
                      style={{
                        width: 70, height: 30, padding: '0 8px', fontSize: 12,
                        border: '1px solid rgba(34,34,34,.12)', borderRadius: 8,
                      }}
                    />
                  )}
                  {target ? (
                    <Link to={target}
                          style={{
                            flex: 'none', height: 30, display: 'flex', alignItems: 'center',
                            padding: '0 12px', borderRadius: 8, background: '#515A38',
                            color: '#fff', fontSize: 12, fontWeight: 600, textDecoration: 'none',
                          }}>
                      이동
                    </Link>
                  ) : (
                    <span style={{
                      flex: 'none', height: 30, display: 'flex', alignItems: 'center',
                      padding: '0 12px', borderRadius: 8, background: '#E4E0D8',
                      color: 'rgba(34,34,34,.4)', fontSize: 12, fontWeight: 600,
                    }}>
                      이동
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}
