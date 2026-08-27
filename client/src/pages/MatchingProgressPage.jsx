import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import AppBar from '../components/AppBar.jsx';
import { getCandidates, cancelMatching } from '../api/endpoints.js';

/** 매칭 진행 페이지 — 로딩 + 진행 바, 후보를 찾으면 결과로 이동 */
export default function MatchingProgressPage() {
  const { id } = useParams();
  const nav = useNavigate();
  const [pct, setPct] = useState(8);

  // 후보 탐색 폴링 (2초 간격)
  const { data } = useQuery({
    queryKey: ['candidates', id],
    queryFn: () => getCandidates(id),
    refetchInterval: 2000,
  });

  useEffect(() => {
    const t = setInterval(() => setPct((p) => Math.min(p + 4, 95)), 600);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    if (data?.length) nav(`/matching/${id}/result`, { replace: true });
  }, [data]);

  return (
    <div className="screen">
      {/* 뒤로가기: 매칭은 백그라운드로 계속 진행하고 홈으로 */}
      <AppBar title="밥친구 찾는 중" onBack={() => nav('/home')} />
      <div className="screen__body" style={{ display: 'flex', flexDirection: 'column',
                                            alignItems: 'center', justifyContent: 'center' }}>
        <div className="spinner" />
        <h2 style={{ marginBottom: 6 }}>취향이 맞는 밥친구를 찾고 있어요</h2>
        <p className="muted" style={{ marginBottom: 24 }}>잠시만 기다려 주세요…</p>
        <div className="progress"><div className="progress__fill" style={{ width: `${pct}%` }} /></div>
        <p className="muted" style={{ marginTop: 8 }}>{pct}%</p>

        <button className="btn btn--line" style={{ marginTop: 32 }}
                onClick={async () => { await cancelMatching(id); nav('/home', { replace: true }); }}>
          매칭 취소하기
        </button>
      </div>
    </div>
  );
}
