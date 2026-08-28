import { useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import AppBar from '../components/AppBar.jsx';
import { askAssistant, getAssistantStatus, getAssistantStarters } from '../api/endpoints.js';

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
      const { reply, source } = await askAssistant(content, history);
      setMessages((prev) => [...prev, { role: 'model', text: reply, source }]);
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
                ? <button className="icon-btn" onClick={reset} aria-label="대화 지우기">🗑</button>
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
              <div className="ai-hello__icon">🍚</div>
              <strong>무엇이든 물어보세요</strong>
              <p className="muted" style={{ marginTop: 6 }}>
                오늘 뭐 먹을지, 앱 사용법, 처음 만나는 사람과의 대화 요령까지 도와드려요.
              </p>
            </div>
            <div className="ai-starters">
              {starters.map((s) => (
                <button key={s} className="ai-starter" onClick={() => send(s)}>{s}</button>
              ))}
            </div>
          </>
        )}

        {messages.map((m, i) => (
          <div key={i} className={`bubble ${m.role === 'user' ? 'bubble--me' : 'bubble--you'}`}
               style={{ whiteSpace: 'pre-wrap' }}>
            {m.text}
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
                aria-label="보내기">↑</button>
      </div>
    </div>
  );
}
