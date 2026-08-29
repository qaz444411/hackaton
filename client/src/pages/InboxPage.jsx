import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Trash2 } from 'lucide-react';
import AppBar from '../components/AppBar.jsx';
import BottomNav from '../components/BottomNav.jsx';
import ConfirmDialog from '../components/ConfirmDialog.jsx';
import {
  getInbox, readProposal, acceptProposal, declineProposal, deleteProposal, getMyMatches,
} from '../api/endpoints.js';
import './InboxPage.css';

const LABEL = { PENDING: '매칭 전', ACCEPTED: '수락됨', DECLINED: '거절함',
                CANCELLED: '취소됨', EXPIRED: '만료됨' };

// 서버(errorHandler)가 DB 트리거 원문을 이미 한국어로 옮겨서 내려준다 — 그대로 보여준다.
function acceptErrorMessage(e) {
  return e?.response?.data?.message || '수락하지 못했어요. 새로고침 후 다시 시도해 주세요.';
}

/** 보관함 — 받은 매칭 요청 목록 (읽음 처리 / 수락 / 취소) */
export default function InboxPage() {
  const nav = useNavigate();
  const qc = useQueryClient();
  const { data = [] } = useQuery({ queryKey: ['inbox'], queryFn: getInbox, refetchInterval: 10000 });
  const { data: myMatches = [] } = useQuery({ queryKey: ['myMatches'], queryFn: getMyMatches });
  const [cancelTarget, setCancelTarget] = useState(null);
  const [cancelling, setCancelling] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleting, setDeleting] = useState(false);

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

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await deleteProposal(deleteTarget.proposal_id);
      refresh();
    } catch (e) {
      alert(e.response?.data?.message || '삭제하지 못했어요.');
    } finally {
      setDeleting(false);
      setDeleteTarget(null);
    }
  };

  return (
    <div className="screen">
      <AppBar title="보관함" back={false} tab />
      <div className="screen__body">
        {!!myMatches.length && (
          <>
            <h2 className="inbox__section-title">밥친구 평가</h2>
            <div className="inbox__list">
              {myMatches.map((m) => (
                <div key={m.match_id} className="notif-card"
                     onClick={() => nav(`/chats/${m.match_id}/rating`)}>
                  <div className="notif-card__top">
                    <img className="notif-card__avatar" src={m.partner_image || '/avatar-default.png'} alt="" />
                    <div className="notif-card__body">
                      <div className="notif-card__name-row">
                        <span className="notif-card__name">{m.partner_nickname}</span>
                        {m.my_score ? (
                          <span className="notif-card__badge notif-card__badge--ACCEPTED">평가 완료</span>
                        ) : (
                          <span className="notif-card__badge">평가 전</span>
                        )}
                      </div>
                      <p className="notif-card__message">
                        {[m.meal_time, m.food_type, m.restaurant_name].filter(Boolean).join(' · ')}
                      </p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}

        <h2 className="inbox__section-title">받은 요청</h2>
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
                    {p.status !== 'PENDING' && (
                      <button type="button" className="notif-card__delete" aria-label="삭제"
                              onClick={(e) => { e.stopPropagation(); setDeleteTarget(p); }}>
                        <Trash2 size={15} strokeWidth={2} />
                      </button>
                    )}
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

      {deleteTarget && (
        <ConfirmDialog
          title="알림을 삭제할까요?"
          desc={`${deleteTarget.partner_nickname}님의 ${LABEL[deleteTarget.status]} 요청이 내 보관함에서만 사라져요.`}
          confirmLabel={deleting ? '삭제하는 중…' : '삭제'}
          cancelLabel="취소"
          onCancel={() => !deleting && setDeleteTarget(null)}
          onConfirm={confirmDelete}
        />
      )}

      <BottomNav />
    </div>
  );
}
