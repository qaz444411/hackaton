import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import AppBar from '../components/AppBar.jsx';
import BottomNav from '../components/BottomNav.jsx';
import { getChatRooms } from '../api/endpoints.js';
import './ChatListPage.css';

const time = (v) => (v ? new Date(v).toLocaleTimeString('ko-KR',
  { hour: '2-digit', minute: '2-digit' }) : '');

/** 채팅 목록 페이지 */
export default function ChatListPage() {
  const nav = useNavigate();
  const { data = [] } = useQuery({ queryKey: ['chatRooms'], queryFn: getChatRooms, refetchInterval: 5000 });

  return (
    <div className="screen">
      <AppBar title="채팅" back={false} />
      <div className="screen__body">
        <div className="cl__list">
          {data.map((r) => (
            <button type="button" key={r.match_id} className="chat-row" onClick={() => nav(`/chats/${r.match_id}`)}>
              <img className="chat-row__avatar" src={r.partner_image || '/avatar-default.png'} alt="" />
              <div className="chat-row__body">
                <div className="chat-row__top">
                  <span className="chat-row__name">{r.partner_nickname}</span>
                  <span className="chat-row__time">{time(r.last_message_at)}</span>
                </div>
                <p className="chat-row__preview">{r.last_message || '대화를 시작해 보세요!'}</p>
                {r.room_status === 'READ_ONLY' && <p className="chat-row__closed">종료된 대화</p>}
              </div>
              {r.unread_count > 0 && <span className="chat-row__badge">{r.unread_count}</span>}
            </button>
          ))}
          {!data.length && <p className="muted">아직 채팅방이 없어요.</p>}
        </div>
      </div>
      <BottomNav />
    </div>
  );
}
