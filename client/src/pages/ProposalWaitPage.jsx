import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import AppBar from '../components/AppBar.jsx';
import { getProposal, cancelProposal } from '../api/endpoints.js';
import './ProposalWaitPage.css';

/** 매칭 요청 대기 페이지 — 수락되면 채팅방으로 자동 이동 */
export default function ProposalWaitPage() {
  const { id } = useParams();
  const nav = useNavigate();
  const [left, setLeft] = useState(null);

  const { data } = useQuery({
    queryKey: ['proposal', id], queryFn: () => getProposal(id), refetchInterval: 3000,
  });

  useEffect(() => {
    if (data?.status === 'ACCEPTED' && data.match_id) nav(`/chats/${data.match_id}`, { replace: true });
  }, [data]);

  useEffect(() => {
    if (!data?.expires_at) return;
    const t = setInterval(() => {
      const s = Math.max(0, Math.floor((new Date(data.expires_at) - Date.now()) / 1000));
      setLeft(s);
    }, 1000);
    return () => clearInterval(t);
  }, [data?.expires_at]);

  const mmss = left != null ? `${String(Math.floor(left / 60)).padStart(2, '0')}:${String(left % 60).padStart(2, '0')}` : '--:--';

  if (data?.status === 'DECLINED') {
    return (
      <div className="screen">
        <AppBar title="매칭 요청" onBack={() => nav('/home')} />
        <div className="screen__body">
          <div className="mrs">
            <div style={{ fontSize: 48, marginBottom: 12 }}>🥲</div>
            <p className="mrs__title">상대방이 요청을 거절했어요</p>
            <p className="mrs__subtitle">다른 밥친구를 찾아볼까요?</p>
            <button type="button" className="btn" onClick={() => nav('/preference')}>
              다시 매칭하기
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="screen">
      <AppBar title="매칭 요청" onBack={() => nav('/home')} />
      <div className="screen__body">
        <div className="mrs">
          <img className="mrs__avatar" src={data?.partner_image || '/avatar-default.png'} alt="" />
          <p className="mrs__title">{data?.partner_nickname}님에게 요청을 보냈어요</p>
          <p className="mrs__subtitle">상대방이 수락하면 채팅방이 열려요.</p>
          <div className="spinner" />
          <p className="mrs__timer">{mmss}</p>
          <p className="mrs__timer-label">남은 응답 시간</p>

          <button type="button" className="btn btn--line mrs__cancel"
                  onClick={async () => { await cancelProposal(id); nav('/home', { replace: true }); }}>
            요청 취소하기
          </button>
        </div>
      </div>
    </div>
  );
}
