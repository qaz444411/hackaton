import { useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import AppBar from '../components/AppBar.jsx';
import BottomNav from '../components/BottomNav.jsx';
import { getInbox, readProposal, acceptProposal, declineProposal } from '../api/endpoints.js';
import './InboxPage.css';

const LABEL = { PENDING: '대기 중', ACCEPTED: '수락됨', DECLINED: '거절함',
                CANCELLED: '취소됨', EXPIRED: '만료됨' };

/** 보관함 — 받은 매칭 요청 목록 (읽음 처리 / 수락 / 거절) */
export default function InboxPage() {
  const nav = useNavigate();
  const qc = useQueryClient();
  const { data = [] } = useQuery({ queryKey: ['inbox'], queryFn: getInbox, refetchInterval: 10000 });

  const refresh = () => { qc.invalidateQueries({ queryKey: ['inbox'] }); qc.invalidateQueries({ queryKey: ['home'] }); };

  const accept = async (p) => {
    const { matchId } = await acceptProposal(p.proposal_id);
    refresh();
    nav(`/chats/${matchId}`);
  };

  return (
    <div className="screen">
      <AppBar title="보관함" back={false} />
      <div className="screen__body">
        <div className="inbox__list">
          {data.map((p) => (
            <div key={p.proposal_id} className="notif-card"
                 onClick={() => { if (p.is_new) readProposal(p.proposal_id).then(refresh); }}>
              <div className="notif-card__top">
                <img className="notif-card__avatar" src={p.partner_image || '/avatar-default.png'} alt="" />
                <div className="notif-card__body">
                  <div className="notif-card__name-row">
                    <span className="notif-card__name">{p.partner_nickname}</span>
                    <span className="notif-card__age">{p.partner_age}세</span>
                    {p.is_new && <span className="notif-card__new">NEW</span>}
                  </div>
                  <p className="notif-card__message">
                    {p.meal_time} · {p.food_type}{p.restaurant_name ? ` · ${p.restaurant_name}` : ''}
                  </p>
                </div>
                <span className="notif-card__status">{LABEL[p.status]}</span>
              </div>

              {p.status === 'PENDING' && (
                <div className="notif-card__actions">
                  <button type="button" className="btn btn--line"
                          onClick={(e) => { e.stopPropagation(); declineProposal(p.proposal_id).then(refresh); }}>
                    거절
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
      <BottomNav />
    </div>
  );
}
