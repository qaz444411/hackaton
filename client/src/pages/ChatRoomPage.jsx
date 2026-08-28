import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { MoreVertical, Sparkles, Send, MapPin } from 'lucide-react';
import AppBar from '../components/AppBar.jsx';
import ConfirmDialog from '../components/ConfirmDialog.jsx';
import { useChatSocket } from '../hooks/useChatSocket.js';
import { getChatRoom, getMessages, getSuggestions, useSuggestion, closeChat } from '../api/endpoints.js';
import { useAuth } from '../context/AuthContext.jsx';
import './ChatRoomPage.css';

const time = (v) => new Date(v).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' });

/**
 * 채팅 상세 페이지 — 제미나이 챗봇 API 사용 지점.
 *  · 추천 질문은 서버 /api/chat/rooms/:matchId/suggestions 가 제미나이를 호출해 생성
 *  · 프론트는 키를 갖지 않고 결과만 표시 → '입력창에 넣기'
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
  const [confirmCancel, setConfirmCancel] = useState(false);
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
    // 전송된 메시지는 소켓의 message:new 브로드캐스트로 나에게도 돌아오므로 여기서는 추가하지 않는다
    // (안 그러면 ack 응답과 브로드캐스트가 겹쳐 두 번 표시된다).
    const res = await send(content);
    if (!res?.ok) alert(res?.message || '메시지를 보낼 수 없습니다.');
  };

  const loadSuggestions = async () => {
    if (openSuggest) { setOpenSuggest(false); return; }
    setOpenSuggest(true);
    setSuggestions(await getSuggestions(matchId, false));
  };

  const cancelMatch = async () => {
    await closeChat(matchId);
    setConfirmCancel(false);
    nav('/chats', { replace: true });
  };

  return (
    <div className="screen">
      <AppBar
        title={room?.partner_nickname || '채팅'}
        right={<button className="icon-btn" onClick={() => setMenu(!menu)}><MoreVertical size={20} /></button>}
      />

      {menu && (
        <div className="card chat-menu-card">
          <button className="btn btn--line" style={{ height: 42 }}
                  onClick={() => { setMenu(false); setConfirmCancel(true); }}>매칭 취소하기</button>
        </div>
      )}

      {confirmCancel && (
        <ConfirmDialog
          title="매칭을 취소하시겠습니까?"
          desc="취소하면 이 대화는 더 이상 이어갈 수 없어요."
          confirmLabel="취소하기"
          cancelLabel="닫기"
          onConfirm={cancelMatch}
          onCancel={() => setConfirmCancel(false)}
        />
      )}

      {room?.restaurant_name && (
        <div className="meeting-strip">
          <MapPin size={14} strokeWidth={2.2} />
          <span>{room.restaurant_name}에서 같이 먹기로 했어요 · {room.meal_time}</span>
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
            <b><Sparkles size={14} style={{ verticalAlign: -2, marginRight: 4 }} />이런 이야기 어때요?</b>
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
          <button type="button" className={`icon-btn${openSuggest ? ' icon-btn--active' : ''}`} onClick={loadSuggestions}>
            <Sparkles size={20} strokeWidth={2} />
          </button>
          <input className="input" value={text} maxLength={500}
                 onChange={(e) => setText(e.target.value)} placeholder="메시지를 입력하세요" />
          <button className="send" type="submit"><Send size={18} strokeWidth={2.2} /></button>
        </form>
      )}
    </div>
  );
}
