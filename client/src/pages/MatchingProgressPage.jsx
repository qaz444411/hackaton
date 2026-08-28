import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import AppBar from '../components/AppBar.jsx';
import { getCandidates, getMatchingDiagnosis, cancelMatching } from '../api/endpoints.js';

/** 후보가 안 잡힐 때 원인을 보여주기까지 기다리는 시간 */
const DIAGNOSE_AFTER_MS = 8000;

/** 매칭 진행 페이지 — 로딩 + 진행 바, 후보를 찾으면 결과로 이동 */
export default function MatchingProgressPage() {
  const { id } = useParams();
  const nav = useNavigate();
  const qc = useQueryClient();
  const [pct, setPct] = useState(8);
  const [leaving, setLeaving] = useState(false);   // 뒤로가기 시 뜨는 선택지
  const [relax, setRelax] = useState(false);       // 조건 넓혀서 찾기
  const [stalled, setStalled] = useState(false);   // 한참 못 찾은 상태

  // 후보 탐색 폴링 (2초 간격)
  const { data } = useQuery({
    queryKey: ['candidates', id, relax],
    queryFn: () => getCandidates(id, relax),
    refetchInterval: 2000,
  });

  // 왜 못 찾는지 — 조건별 원인
  const { data: diag } = useQuery({
    queryKey: ['matching', id, 'diagnosis'],
    queryFn: () => getMatchingDiagnosis(id),
    enabled: stalled,
    refetchInterval: 5000,
  });

  useEffect(() => {
    const t = setInterval(() => setPct((p) => Math.min(p + 4, 95)), 600);
    const s = setTimeout(() => setStalled(true), DIAGNOSE_AFTER_MS);
    return () => { clearInterval(t); clearTimeout(s); };
  }, []);

  useEffect(() => {
    if (data?.length) nav(`/matching/${id}/result${relax ? '?relax=1' : ''}`, { replace: true });
  }, [data]);

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ['matching', 'current'] });
    qc.invalidateQueries({ queryKey: ['home'] });
  };

  const cancel = async () => {
    try {
      await cancelMatching(id);
    } catch (e) {
      alert(e.response?.data?.message || '취소하지 못했어요.');
    } finally {
      refresh();
      nav('/home', { replace: true });
    }
  };

  const noneYet = stalled && data && data.length === 0;

  return (
    <div className="screen">
      {/*
        뒤로가기를 그냥 홈으로 보내면 매칭이 SEARCHING 인 채로 남는다.
        활성 요청은 1건만 허용돼서 그 상태로는 새 매칭을 시작할 수 없으므로,
        나가기 전에 "계속 찾기 / 취소" 를 반드시 물어본다.
      */}
      <AppBar title="밥친구 찾는 중" onBack={() => setLeaving(true)} />

      <div className="screen__body" style={{ display: 'flex', flexDirection: 'column',
                                            alignItems: 'center', justifyContent: 'center' }}>
        <div className="spinner" />
        <h2 style={{ marginBottom: 6 }}>
          {relax ? '조건을 넓혀서 찾고 있어요' : '취향이 맞는 밥친구를 찾고 있어요'}
        </h2>
        <p className="muted" style={{ marginBottom: 24 }}>잠시만 기다려 주세요…</p>
        <div className="progress"><div className="progress__fill" style={{ width: `${pct}%` }} /></div>
        <p className="muted" style={{ marginTop: 8 }}>{pct}%</p>

        {/* 무한 스피너 대신 왜 못 찾는지 알려준다 */}
        {noneYet && (
          <div className="card stall-card">
            <strong>아직 맞는 분을 못 찾았어요</strong>
            <ul className="stall-list">
              {(diag?.reasons?.length ? diag.reasons : ['조건에 맞는 사람을 찾는 중이에요.'])
                .map((r) => <li key={r}>{r}</li>)}
            </ul>
            {diag && (
              <p className="muted">지금 매칭 중인 다른 사람: {diag.searching}명</p>
            )}
            {!relax && diag?.searching > 0 && (
              <button className="btn" style={{ marginTop: 12 }} onClick={() => setRelax(true)}>
                조건 넓혀서 찾기
              </button>
            )}
            <button className="btn btn--line" style={{ marginTop: 8 }}
                    onClick={async () => { await cancelMatching(id); refresh(); nav('/preference'); }}>
              조건 바꾸기
            </button>
          </div>
        )}

        <button className="btn btn--line" style={{ marginTop: 24 }} onClick={cancel}>
          매칭 취소하기
        </button>
      </div>

      {/* 뒤로가기 선택지 */}
      {leaving && (
        <div className="sheet">
          <div className="sheet__handle" onClick={() => setLeaving(false)} />
          <strong style={{ fontSize: 17 }}>매칭을 어떻게 할까요?</strong>
          <p className="muted" style={{ marginTop: 6 }}>
            계속 찾으면 홈에서 진행 상황을 볼 수 있어요.
            매칭을 취소하지 않으면 새로운 매칭을 시작할 수 없습니다.
          </p>
          <div className="row" style={{ marginTop: 14 }}>
            <button className="btn btn--line" onClick={cancel}>매칭 취소</button>
            <button className="btn" onClick={() => { refresh(); nav('/home'); }}>
              계속 찾기
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
