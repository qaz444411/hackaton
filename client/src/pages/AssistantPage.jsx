import { useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Trash2, Sparkles, ArrowUp } from 'lucide-react';
import AppBar from '../components/AppBar.jsx';
import { askAssistant, getAssistantStatus, getAssistantStarters } from '../api/endpoints.js';
import { useMyLocation, GEO } from '../hooks/useKakaoMap.js';

const STORAGE_KEY = 'assistant.history';
const MAX_KEPT = 30;   // 서버가 받는 상한과 맞춘다

/**
 * AI 도우미 — 제미나이 챗봇.
 *  · 대화 이력은 브라우저(localStorage)에 두고 매번 서버로 함께 보낸다(서버 무상태).
 *  · 다른 사용자와의 채팅 원문은 여기로 넘어가지 않는다.
 *  · 키가 없으면 서버가 source:'NO_KEY' 로 안내 문구를 돌려준다.
 */
export default function AssistantPage() {
  const nav = useNavigate();
  const [sp] = useSearchParams();
  const preset = sp.get('q');

  const { data: status } = useQuery({ queryKey: ['assistant', 'status'], queryFn: getAssistantStatus });
  const { data: startersData } = useQuery({ queryKey: ['assistant', 'starters'], queryFn: getAssistantStarters });
  const starters = startersData?.starters || [];

  // 맛집 추천에 쓸 현재 위치. 없으면 일반 대화만 하고 추천은 생략된다.
  const { pos, state: geoState, request: requestLocation } = useMyLocation({ watch: false });

  const [messages, setMessages] = useState(() => {
    try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]'); } catch { return []; }
  });
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const listRef = useRef(null);
  const presetSent = useRef(false);

  // 이력 보존 (새로고침해도 대화가 이어지게)
  useEffect(() => {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(messages.slice(-MAX_KEPT))); } catch { /* 용량 초과 무시 */ }
  }, [messages]);

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, busy]);

  const send = async (text) => {
    const content = (text ?? input).trim();
    if (!content || busy) return;

    // 지금까지의 대화를 문맥으로 넘긴다(방금 보낸 건 message 로 따로 감)
    const history = messages.slice(-MAX_KEPT).map((m) => ({ role: m.role, text: m.text }));
    setMessages((prev) => [...prev, { role: 'user', text: content }]);
    setInput('');
    setBusy(true);
    try {
      const { reply, source, restaurants } = await askAssistant(content, history, pos);
      setMessages((prev) => [...prev, { role: 'model', text: reply, source, restaurants }]);
    } catch (e) {
      setMessages((prev) => [...prev, {
        role: 'model', source: 'ERROR',
        text: e.response?.data?.message || '연결이 끊겼어요. 잠시 후 다시 시도해 주세요.',
      }]);
    } finally {
      setBusy(false);
    }
  };

  // 홈에서 질문을 눌러 들어온 경우 자동으로 한 번 보낸다
  useEffect(() => {
    if (preset && !presetSent.current) {
      presetSent.current = true;
      send(preset);
    }
  }, [preset]);

  const reset = () => {
    setMessages([]);
    try { localStorage.removeItem(STORAGE_KEY); } catch { /* 무시 */ }
  };

  return (
    <div className="screen">
      <AppBar title="AI 도우미" onBack={() => nav('/home')}
              right={messages.length
                ? <button className="icon-btn" onClick={reset} aria-label="대화 지우기"><Trash2 size={18} /></button>
                : null} />

      {status && !status.enabled && (
        <div className="ai-warn">
          제미나이 API 키가 없어서 지금은 안내만 할 수 있어요.
          <code>server/.env</code> 의 <code>GEMINI_API_KEY</code> 를 채우고 서버를 재시작해 주세요.
        </div>
      )}

      <div className="chat-list" ref={listRef}>
        {!messages.length && (
          <>
            <div className="ai-hello">
              <div className="ai-hello__icon"><Sparkles size={26} strokeWidth={2} /></div>
              <strong>무엇이든 물어보세요</strong>
              <p className="muted" style={{ marginTop: 6 }}>
                오늘 뭐 먹을지, 앱 사용법, 처음 만나는 사람과의 대화 요령까지 도와드려요.
              </p>
            </div>
            <div className="ai-starters">
              {starters.map((s) => (
                <button key={s} className="ai-starter" onClick={() => send(s)}>{s}</button>
              ))}
              <button className="ai-starter" onClick={() => send('이 근처에서 뭐 먹을지 추천해줘')}>
                📍 이 근처 맛집 추천해줘
              </button>
            </div>
          </>
        )}

        {/* 위치를 못 받으면 추천이 일반 답변으로만 나가므로 이유를 알려준다 */}
        {!pos && geoState !== GEO.LOCATING && (
          <div className="ai-geo">
            <span>
              {geoState === GEO.INSECURE
                ? 'http 접속이라 위치를 쓸 수 없어요. https 주소로 열면 근처 맛집을 추천해 드려요.'
                : '위치를 허용하면 지금 계신 곳 근처 맛집을 추천해 드려요.'}
            </span>
            {geoState !== GEO.INSECURE && (
              <button className="geo-notice__btn" onClick={requestLocation}>위치 허용</button>
            )}
          </div>
        )}

        {messages.map((m, i) => (
          <div key={i} className="msg-group">
            <div className={`bubble ${m.role === 'user' ? 'bubble--me' : 'bubble--you'}`}
                 style={{ whiteSpace: 'pre-wrap' }}>
              {m.text}
            </div>

            {/* 위치 기반 추천 결과 — 바로 밥친구 모집으로 이어진다 */}
            {m.restaurants?.length > 0 && (
              <div className="rec-list">
                {m.restaurants.map((r) => (
                  <div key={r.restaurant_id} className="rec-card">
                    <div className="rec-card__head">
                      <strong>{r.name}</strong>
                      <span className="rec-card__dist">{r.distance_m}m</span>
                    </div>
                    <p className="muted">
                      {r.food_type_label}
                      {r.road_address ? ` · ${r.road_address}` : ''}
                    </p>
                    {r.recruiting_count > 0 && (
                      <p className="rec-card__recruit">
                        지금 {r.recruiting_count}명이 밥친구를 찾고 있어요
                      </p>
                    )}
                    <div className="row" style={{ marginTop: 10 }}>
                      {r.place_url && (
                        <a className="btn btn--line rec-card__link"
                           href={r.place_url} target="_blank" rel="noreferrer">
                          정보 보기
                        </a>
                      )}
                      <button className="btn"
                              onClick={() => nav(r.recruiting_count > 0
                                ? `/restaurants/${r.restaurant_id}/buddies`
                                : `/preference?restaurantId=${r.restaurant_id}`)}>
                        {r.recruiting_count > 0 ? '밥친구 보기' : '여기서 모집하기'}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}

        {busy && (
          <div className="bubble bubble--you ai-typing">
            <span /><span /><span />
          </div>
        )}
      </div>

      <div className="chat-input">
        <input className="input" placeholder="메시지를 입력하세요" value={input} maxLength={500}
               onChange={(e) => setInput(e.target.value)}
               onKeyDown={(e) => e.key === 'Enter' && send()} />
        <button className="send" onClick={() => send()} disabled={busy || !input.trim()}
                aria-label="보내기"><ArrowUp size={18} strokeWidth={2.2} /></button>
      </div>
    </div>
  );
}
