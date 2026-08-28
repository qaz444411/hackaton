import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Sparkles } from 'lucide-react';
import AppBar from '../components/AppBar.jsx';
import { getCandidates, cancelMatching } from '../api/endpoints.js';
import './MatchingProgressPage.css';

/**
 * 매칭 신청 접수 화면 — app/ MatchingPage 디자인.
 * 기다리는 화면을 보여주지 않고 "찾아드릴게요" 안내만 띄운 뒤 홈으로 돌아간다.
 * 후보는 화면 뒤에서 계속 폴링하다가 찾으면 결과 화면으로 자동 이동한다.
 *
 * 뒤로가기를 그냥 홈으로 보내면 매칭이 SEARCHING 인 채로 남는다.
 * 활성 요청은 1건만 허용돼서 그 상태로는 새 매칭을 시작할 수 없으므로,
 * 나가기 전에 "계속 찾기 / 취소" 를 반드시 물어본다.
 */
export default function MatchingProgressPage() {
  const { id } = useParams();
  const nav = useNavigate();
  const qc = useQueryClient();
  const [leaving, setLeaving] = useState(false);

  const { data } = useQuery({
    queryKey: ['candidates', id],
    queryFn: () => getCandidates(id),
    refetchInterval: 2000,
  });

  useEffect(() => {
    if (data?.length) nav(`/matching/${id}/result`, { replace: true });
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

  return (
    <div className="screen">
      <AppBar title="매칭 신청" onBack={() => setLeaving(true)} />
      <div className="screen__body">
        <div className="matching">
          <div className="matching__icon"><Sparkles size={40} strokeWidth={2} /></div>
          <p className="matching__title">밥친구를 찾아볼게요</p>
          <p className="matching__desc">취향이 맞는 친구를 찾으면 알려드릴게요!</p>

          <div className="matching__notice">
            <span>찾으면 보관함 알림으로 알려드릴게요</span>
          </div>

          <button type="button" className="btn matching__cta" onClick={() => nav('/home', { replace: true })}>
            홈으로 돌아가기
          </button>
          <button type="button" className="matching__cancel-link" onClick={cancel}>
            매칭 취소하기
          </button>
        </div>
      </div>

      {/* 뒤로가기 선택지 — 취소하지 않으면 새 매칭을 시작할 수 없다는 걸 분명히 알려준다 */}
      {leaving && (
        <div className="sheet">
          <div className="sheet__handle" onClick={() => setLeaving(false)} />
          <strong style={{ fontSize: 17 }}>매칭을 어떻게 할까요?</strong>
          <p className="muted" style={{ marginTop: 6 }}>
            계속 찾으면 홈에서 진행 상황을 볼 수 있어요.
            매칭을 취소하지 않으면 새로운 매칭을 시작할 수 없습니다.
          </p>
          <div className="row" style={{ marginTop: 14 }}>
            <button type="button" className="btn btn--line" onClick={cancel}>매칭 취소</button>
            <button type="button" className="btn" onClick={() => { refresh(); nav('/home'); }}>
              계속 찾기
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
