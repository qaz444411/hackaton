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
                <p className="chat-row__preview">{r.last_message || '대화를 시작해 보세요!'}</p>
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
