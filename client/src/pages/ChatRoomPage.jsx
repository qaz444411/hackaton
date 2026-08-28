import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import AppBar from '../components/AppBar.jsx';
import { useChatSocket } from '../hooks/useChatSocket.js';
import { getChatRoom, getMessages, getSuggestions, useSuggestion, reportChat } from '../api/endpoints.js';
import { useAuth } from '../context/AuthContext.jsx';

const time = (v) => new Date(v).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' });

/**
 * 채팅 상세 페이지 — 제미나이 챗봇 API 사용 지점.
 *  · 추천 질문은 서버 /api/chat/rooms/:matchId/suggestions 가 제미나이를 호출해 생성
 *  · 프론트는 키를 갖지 않고 결과만 표시 → '입력창에 넣기' / '다른 질문 보기'
 */
export default function ChatRoomPage() {
  const { matchId } = useParams();
  const nav = useNavigate();
  const { user } = useAuth();
  const [messages, setMessages] = useState([]);
  const [text, setText] = useState('');
  const [openSuggest, setOpenSuggest] = useState(false);
  const [suggestions, setSuggestions] = useState([]);
  const [menu, setMenu] = useState(false);
  const bottomRef = useRef(null);

  const { data: room } = useQuery({ queryKey: ['chatRoom', matchId], queryFn: () => getChatRoom(matchId) });
  const { send } = useChatSocket(matchId, (m) =>
    setMessages((prev) => (prev.some((x) => x.id === m.id) ? prev : [...prev, m])));

  useEffect(() => { getMessages(matchId).then(setMessages); }, [matchId]);
  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);

  const readOnly = room?.roomStatus === 'READ_ONLY';

  const submit = async (e) => {
    e.preventDefault();
    const content = text.trim();
    if (!content) return;
    setText('');
    const res = await send(content);
    if (res?.ok) setMessages((prev) => [...prev, res.message]);
    else alert(res?.message || '메시지를 보낼 수 없습니다.');
  };

  const loadSuggestions = async (refresh = false) => {
    setOpenSuggest(true);
    setSuggestions(await getSuggestions(matchId, refresh));
  };

  const report = async () => {
    const reasonCode = prompt('신고 사유 코드 (SPAM/ABUSE/SEXUAL/NOSHOW/FRAUD/ETC)', 'ETC');
    if (!reasonCode) return;
    await reportChat(matchId, { reasonCode });
    alert('신고가 접수되었고 대화가 종료되었습니다.');
    nav('/chats', { replace: true });
  };

  return (
    <div className="screen">
      <AppBar
        title={room?.partner_nickname || '채팅'}
        right={<button className="icon-btn" onClick={() => setMenu(!menu)}>⋮</button>}
      />

      {menu && (
        <div className="card" style={{ margin: '0 16px 8px' }}>
          <button className="btn btn--line" style={{ height: 42 }} onClick={report}>신고하고 나가기</button>
        </div>
      )}

      {room?.restaurant_name && (
        <div className="card" style={{ margin: '0 16px 8px' }}>
          <span className="tag">약속</span>
          <p style={{ marginTop: 8 }}>
            📍 {room.restaurant_name} · {room.meal_time}
          </p>
        </div>
      )}

      <div className="chat-list">
        {messages.map((m) => (
          <div key={m.id}
               className={`bubble ${m.message_type === 'SYSTEM' ? 'bubble--sys'
                 : m.sender_id === user.id ? 'bubble--me' : 'bubble--you'}`}>
            {m.content}
            {m.message_type !== 'SYSTEM' && (
              <div style={{ fontSize: 10, opacity: .7, marginTop: 4 }}>{time(m.sent_at)}</div>
            )}
          </div>
        ))}
        <div ref={bottomRef} />
      </div>

      {/* 제미나이 대화 주제 추천 */}
      {openSuggest && (
        <div className="suggest">
          <div className="suggest__head">
            <b>✨ 이런 이야기 어때요?</b>
            <button className="icon-btn" style={{ fontSize: 13 }}
                    onClick={() => loadSuggestions(true)}>다른 질문 보기</button>
          </div>
          {suggestions.map((s) => (
            <button key={s.id} className="suggest__item"
                    onClick={() => { setText(s.question); useSuggestion(s.id); setOpenSuggest(false); }}>
              {s.question}
            </button>
          ))}
        </div>
      )}

      {readOnly ? (
        <div className="chat-input"><p className="muted">종료된 대화입니다.</p></div>
      ) : (
        <form className="chat-input" onSubmit={submit}>
          <button type="button" className="icon-btn" onClick={() => loadSuggestions(false)}>✨</button>
          <input className="input" value={text} maxLength={500}
                 onChange={(e) => setText(e.target.value)} placeholder="메시지를 입력하세요" />
          <button className="send" type="submit">➤</button>
        </form>
      )}
    </div>
  );
}
