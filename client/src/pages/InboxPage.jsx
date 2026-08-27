import { useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import AppBar from '../components/AppBar.jsx';
import BottomNav from '../components/BottomNav.jsx';
import { getInbox, readProposal, acceptProposal, declineProposal } from '../api/endpoints.js';

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
        <div className="list">
          {data.map((p) => (
            <div key={p.proposal_id} className="card"
                 onClick={() => { if (p.is_new) readProposal(p.proposal_id).then(refresh); }}>
              <div className="list-item">
                <img className="avatar" src={p.partner_image || '/avatar-default.png'} alt="" />
                <div className="list-item__body">
                  <div className="row" style={{ gap: 6 }}>
                    <strong>{p.partner_nickname}</strong>
                    <span className="muted">{p.partner_age}세</span>
                    {p.is_new ? <span className="tag">NEW</span> : null}
                  </div>
                  <div className="muted ellipsis">
                    {p.meal_time} · {p.food_type}{p.restaurant_name ? ` · ${p.restaurant_name}` : ''}
                  </div>
                </div>
                <span className="muted">{LABEL[p.status]}</span>
              </div>

              {p.status === 'PENDING' && (
                <div className="row" style={{ marginTop: 12 }}>
                  <button className="btn btn--line" style={{ height: 44 }}
                          onClick={(e) => { e.stopPropagation(); declineProposal(p.proposal_id).then(refresh); }}>
                    거절
                  </button>
                  <button className="btn" style={{ height: 44 }}
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
