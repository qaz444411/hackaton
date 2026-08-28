import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Trash2 } from 'lucide-react';
import AppBar from '../components/AppBar.jsx';
import BottomNav from '../components/BottomNav.jsx';
import ConfirmDialog from '../components/ConfirmDialog.jsx';
import { getChatRooms, deleteChatRoom } from '../api/endpoints.js';
import './ChatListPage.css';

const time = (v) => (v ? new Date(v).toLocaleTimeString('ko-KR',
  { hour: '2-digit', minute: '2-digit' }) : '');

// RESTAURANT/MEETING 메시지는 content 가 JSON 카드 데이터라 그대로 보여주면 안 된다 —
// 채팅방 안 말풍선처럼 사람이 읽는 문장으로 바꿔서 미리보기에 넣는다.
function previewText(r) {
  if (!r.last_message) return '대화를 시작해 보세요!';
  if (r.last_message_type === 'RESTAURANT') {
    try { return `${JSON.parse(r.last_message).name} 식당을 보냈어요`; } catch { return '식당을 보냈어요'; }
  }
  if (r.last_message_type === 'MEETING') {
    try {
      const c = JSON.parse(r.last_message);
      return c.restaurantName ? `${c.restaurantName}에서 약속을 잡았어요` : '약속을 잡았어요';
    } catch { return '약속을 잡았어요'; }
  }
  if (r.last_message_type === 'LOTTERY') return '🎟️ 랜덤 메뉴 복권을 보냈어요';
  return r.last_message;
}

/** 채팅 목록 페이지 */
export default function ChatListPage() {
  const nav = useNavigate();
  const qc = useQueryClient();
  const { data = [] } = useQuery({ queryKey: ['chatRooms'], queryFn: getChatRooms, refetchInterval: 5000 });
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleting, setDeleting] = useState(false);

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await deleteChatRoom(deleteTarget.match_id);
      qc.invalidateQueries({ queryKey: ['chatRooms'] });
    } catch (e) {
      alert(e.response?.data?.message || '삭제하지 못했어요.');
    } finally {
      setDeleting(false);
      setDeleteTarget(null);
    }
  };

  return (
    <div className="screen">
      <AppBar title="채팅" back={false} tab />
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
                <p className="chat-row__preview">{previewText(r)}</p>
                {r.room_status === 'READ_ONLY' && <p className="chat-row__closed">종료된 대화</p>}
              </div>
              {r.unread_count > 0 && <span className="chat-row__badge">{r.unread_count}</span>}
              {r.room_status === 'READ_ONLY' && (
                <span role="button" tabIndex={0} className="chat-row__delete" aria-label="채팅방 삭제"
                      onClick={(e) => { e.stopPropagation(); setDeleteTarget(r); }}
                      onKeyDown={(e) => { if (e.key === 'Enter') { e.stopPropagation(); setDeleteTarget(r); } }}>
                  <Trash2 size={16} strokeWidth={2} />
                </span>
              )}
            </button>
          ))}
          {!data.length && <p className="muted">아직 채팅방이 없어요.</p>}
        </div>
      </div>

      {deleteTarget && (
        <ConfirmDialog
          title="채팅방을 삭제하시겠습니까?"
          desc="내 목록에서만 사라져요. 상대방 채팅방에는 남아있어요."
          confirmLabel={deleting ? '삭제하는 중…' : '삭제하기'}
          cancelLabel="닫기"
          onCancel={() => !deleting && setDeleteTarget(null)}
          onConfirm={confirmDelete}
        />
      )}

      <BottomNav />
    </div>
  );
}
