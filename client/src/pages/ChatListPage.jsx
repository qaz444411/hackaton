import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import AppBar from '../components/AppBar.jsx';
import BottomNav from '../components/BottomNav.jsx';
import { getChatRooms } from '../api/endpoints.js';

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
        <div className="list">
          {data.map((r) => (
            <div key={r.match_id} className="card" onClick={() => nav(`/chats/${r.match_id}`)}>
              <div className="list-item">
                <img className="avatar" src={r.partner_image || '/avatar-default.png'} alt="" />
                <div className="list-item__body">
                  <strong>{r.partner_nickname}</strong>
                  <div className="muted ellipsis">{r.last_message || '대화를 시작해 보세요!'}</div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div className="muted" style={{ fontSize: 11 }}>{time(r.last_message_at)}</div>
                  {r.unread_count > 0 && <span className="tag" style={{ marginTop: 4 }}>{r.unread_count}</span>}
                </div>
              </div>
              {r.room_status === 'READ_ONLY' && <p className="muted" style={{ marginTop: 8 }}>종료된 대화</p>}
            </div>
          ))}
          {!data.length && <p className="muted">아직 채팅방이 없어요.</p>}
        </div>
      </div>
      <BottomNav />
    </div>
  );
}
