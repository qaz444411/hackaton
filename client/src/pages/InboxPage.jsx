import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import AppBar from '../components/AppBar.jsx';
import BottomNav from '../components/BottomNav.jsx';
import ConfirmDialog from '../components/ConfirmDialog.jsx';
import { getInbox, readProposal, acceptProposal, declineProposal } from '../api/endpoints.js';
import './InboxPage.css';

const LABEL = { PENDING: '매칭 전', ACCEPTED: '수락됨', DECLINED: '거절함',
                CANCELLED: '취소됨', EXPIRED: '만료됨' };

function acceptErrorMessage(e) {
  const msg = e?.response?.data?.message || '';
  if (msg.includes('expired')) return '이미 만료된 요청이에요. 상대에게 다시 요청해 달라고 해보세요.';
  if (msg.includes('not PENDING')) return '이미 처리된 요청이에요. 새로고침할게요.';
  if (msg.includes('not SEARCHING')) return '상대가 매칭을 취소했거나 이미 다른 분과 확정됐어요.';
  return msg || '수락하지 못했어요. 새로고침 후 다시 시도해 주세요.';
}

/** 보관함 — 받은 매칭 요청 목록 (읽음 처리 / 수락 / 취소) */
export default function InboxPage() {
  const nav = useNavigate();
  const qc = useQueryClient();
  const { data = [] } = useQuery({ queryKey: ['inbox'], queryFn: getInbox, refetchInterval: 10000 });
  const [cancelTarget, setCancelTarget] = useState(null);
  const [cancelling, setCancelling] = useState(false);

  const refresh = () => { qc.invalidateQueries({ queryKey: ['inbox'] }); qc.invalidateQueries({ queryKey: ['home'] }); };

  const accept = async (p) => {
    try {
      const { matchId } = await acceptProposal(p.proposal_id);
      refresh();
      nav(`/chats/${matchId}`);
    } catch (e) {
      // 이전엔 에러를 그냥 삼켜서 버튼이 "가끔 안 눌리는" 것처럼 보였다 —
      // 만료됐거나 상대가 이미 다른 매칭을 확정한 경우 등, 실패 사유를 알려준다.
      alert(acceptErrorMessage(e));
      refresh();
    }
  };

  const confirmCancel = async () => {
    if (!cancelTarget) return;
    setCancelling(true);
    try {
      await declineProposal(cancelTarget.proposal_id);
      refresh();
    } catch (e) {
      alert(e.response?.data?.message || '취소하지 못했어요.');
    } finally {
      setCancelling(false);
      setCancelTarget(null);
    }
  };

  return (
    <div className="screen">
      <AppBar title="보관함" back={false} tab />
      <div className="screen__body">
        <div className="inbox__list">
          {data.map((p) => (
            <div key={p.proposal_id} className="notif-card"
                 onClick={() => { if (p.is_new) readProposal(p.proposal_id).then(refresh); }}>
              <div className="notif-card__top">
                <img className="notif-card__avatar" src={p.partner_image || '/avatar-default.png'} alt="" />
                <div className="notif-card__body">
                  <div className="notif-card__name-row">
                    <span className="notif-card__name">{p.partner_nickname} · {p.partner_age}세</span>
                    <span className={`notif-card__badge notif-card__badge--${p.status}`}>{LABEL[p.status]}</span>
                    {p.is_new && <span className="notif-card__new">NEW</span>}
                  </div>
                  <p className="notif-card__message">
                    {p.meal_time} · {p.food_type}{p.restaurant_name ? ` · ${p.restaurant_name}` : ''}
                  </p>
                </div>
              </div>

              {p.status === 'PENDING' && (
                <div className="notif-card__actions">
                  <button type="button" className="btn btn--line"
                          onClick={(e) => { e.stopPropagation(); setCancelTarget(p); }}>
                    매칭 취소
                  </button>
                  <button type="button" className="btn"
                          onClick={(e) => { e.stopPropagation(); accept(p); }}>
                    같이 밥 먹기
                  </button>
                </div>
              )}
            </div>
          ))}
          {!data.length && <p className="muted">아직 받은 매칭 요청이 없어요.</p>}
        </div>
      </div>

      {cancelTarget && (
        <ConfirmDialog
          title="매칭을 취소할까요?"
          desc={`${cancelTarget.partner_nickname}님과의 ${cancelTarget.meal_time} 밥친구 매칭이 취소돼요.`}
          confirmLabel={cancelling ? '취소하는 중…' : '매칭 취소'}
          cancelLabel="매칭 유지"
          onCancel={() => !cancelling && setCancelTarget(null)}
          onConfirm={confirmCancel}
        />
      )}

      <BottomNav />
    </div>
  );
}
