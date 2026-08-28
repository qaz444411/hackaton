import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Check } from 'lucide-react';
import AppBar from '../components/AppBar.jsx';
import { getChatRoom, getRating, submitRating, reportChat } from '../api/endpoints.js';
import './RatingPage.css';

const SCORES = [
  { v: 1, label: '별로였어요' },
  { v: 2, label: '아쉬웠어요' },
  { v: 3, label: '괜찮았어요' },
  { v: 4, label: '좋았어요' },
  { v: 5, label: '또 만나고 싶어요' },
];

const TAGS = [
  { code: 'TALK_GOOD', label: '대화가 편했어요' },
  { code: 'PUNCTUAL', label: '시간 약속을 잘 지켰어요' },
  { code: 'TASTE_MATCH', label: '식사 취향이 잘 맞았어요' },
  { code: 'WANT_AGAIN', label: '다시 만나고 싶어요' },
  { code: 'TALK_BAD', label: '대화가 잘 안 맞았어요' },
  { code: 'LATE', label: '약속 시간이 아쉬웠어요' },
];

const REPORT_REASONS = [
  { code: 'ABUSE', label: '불쾌한 언행' },
  { code: 'NOSHOW', label: '약속 불이행' },
  { code: 'FRAUD', label: '허위 정보' },
  { code: 'SEXUAL', label: '부적절한 목적의 만남' },
  { code: 'ETC', label: '기타' },
];

/** 채팅 "..." 메뉴 → 밥친구 평가하기. 상대에게 공개하지 않고 저장만 한다. */
export default function RatingPage() {
  const { matchId } = useParams();
  const nav = useNavigate();
  const { data: room } = useQuery({ queryKey: ['chatRoom', matchId], queryFn: () => getChatRoom(matchId) });
  const { data: existing } = useQuery({ queryKey: ['rating', matchId], queryFn: () => getRating(matchId) });

  const [score, setScore] = useState(null);
  const [tags, setTags] = useState(new Set());
  // 이미 남긴 평가가 있으면 그대로 불러와서 수정할 수 있게 한다
  useEffect(() => {
    if (existing) { setScore(existing.score); setTags(new Set(existing.tags)); }
  }, [existing]);
  const [submitting, setSubmitting] = useState(false);
  // 신고 — '사유 선택' 시트 다음 '접수할까요?' 확인 시트로 이어지는 2단계
  const [reportStep, setReportStep] = useState(null); // 'reason' | 'confirm' | null
  const [reportReason, setReportReason] = useState(null);
  const [reportDetail, setReportDetail] = useState('');
  const [reporting, setReporting] = useState(false);

  const closeReport = () => { setReportStep(null); setReportReason(null); setReportDetail(''); };

  const toggleTag = (code) => {
    setTags((prev) => {
      const next = new Set(prev);
      if (next.has(code)) next.delete(code); else next.add(code);
      return next;
    });
  };

  const submit = async () => {
    if (!score) return;
    setSubmitting(true);
    try {
      await submitRating(matchId, { score, tags: [...tags] });
      nav(`/chats/${matchId}`, { replace: true });
    } catch (e) {
      alert(e.response?.data?.message || '평가를 보내지 못했어요.');
    } finally {
      setSubmitting(false);
    }
  };

  const confirmReport = async () => {
    setReporting(true);
    try {
      await reportChat(matchId, { reasonCode: reportReason.code, detail: reportDetail.trim() || undefined });
      nav('/chats', { replace: true });
    } catch (e) {
      alert(e.response?.data?.message || '신고하지 못했어요.');
      setReporting(false);
    }
  };

  if (!room) return <div className="screen center">불러오는 중…</div>;

  return (
    <div className="screen">
      <AppBar title="밥친구 평가" onBack={() => nav(-1)} />
      <div className="screen__body">
        <div className="rating__partner-card">
          <div className="rating__partner-row">
            <img className="rating__partner-avatar" src={room.partner_image || '/avatar-default.png'} alt="" />
            <p className="rating__partner-name">{room.partner_nickname}</p>
          </div>
          {(room.restaurant_name || room.meal_time) && (
            <p className="rating__partner-place">
              {[room.restaurant_name, room.meal_time].filter(Boolean).join(' · ')}
            </p>
          )}
        </div>

        <p className="rating__prompt">함께한 식사는 어떠셨나요?</p>

        <p className="section-title" style={{ marginTop: 20 }}>이번 밥친구는 어땠나요?</p>
        <p className="rating__disclaimer">평가는 상대방에게 공개되지 않으며 다음 매칭 추천에만 반영돼요.</p>

        <div className="rating__scores">
          {SCORES.map((s) => (
            <button key={s.v} type="button"
                    className={`rating__score${score === s.v ? ' rating__score--active' : ''}`}
                    onClick={() => setScore(s.v)}>
              <span className="rating__score-num">{s.v}</span>
              <span className="rating__score-label">{s.label}</span>
            </button>
          ))}
        </div>

        <p className="section-title" style={{ marginTop: 24 }}>어떤 점이 좋거나 아쉬웠나요? · 선택</p>
        <div className="rating__tags">
          {TAGS.map((t) => (
            <button key={t.code} type="button"
                    className={`rating__tag${tags.has(t.code) ? ' rating__tag--active' : ''}`}
                    onClick={() => toggleTag(t.code)}>
              {t.label}
            </button>
          ))}
        </div>

        <div className="rating__report-row">
          <span>문제가 있었나요?</span>
          <button type="button" className="rating__report-link" onClick={() => setReportStep('reason')}>신고하기</button>
        </div>
      </div>

      <div className="rating__footer">
        <button type="button" className="rating__submit" disabled={!score || submitting} onClick={submit}>
          {submitting ? '보내는 중…' : '평가 완료'}
        </button>
      </div>

      {/* 신고 1단계 — 사유 선택 + 상세 내용 */}
      {reportStep === 'reason' && (
        <>
          <div className="sheet-backdrop" onClick={closeReport} />
          <div className="sheet report-sheet">
            <div className="sheet__handle" onClick={closeReport} />
            <p className="report-sheet__title">신고 사유를 선택해주세요</p>
            <div className="report-sheet__list">
              {REPORT_REASONS.map((r) => (
                <button key={r.code} type="button"
                        className={`report-sheet__reason${reportReason?.code === r.code ? ' report-sheet__reason--active' : ''}`}
                        onClick={() => setReportReason(r)}>
                  {r.label}
                  {reportReason?.code === r.code && <Check size={16} strokeWidth={2.4} />}
                </button>
              ))}
            </div>
            <textarea className="report-sheet__detail" maxLength={300} placeholder="상세 내용을 입력해주세요"
                      value={reportDetail} onChange={(e) => setReportDetail(e.target.value)} />
            <div className="report-sheet__actions">
              <button type="button" className="report-sheet__cancel" onClick={closeReport}>취소</button>
              <button type="button" className="report-sheet__next" disabled={!reportReason}
                      onClick={() => setReportStep('confirm')}>신고하기</button>
            </div>
          </div>
        </>
      )}

      {/* 신고 2단계 — 접수 확인 */}
      {reportStep === 'confirm' && (
        <>
          <div className="sheet-backdrop" onClick={closeReport} />
          <div className="sheet report-confirm">
            <div className="sheet__handle" onClick={closeReport} />
            <p className="report-sheet__title">신고를 접수할까요?</p>
            <p className="report-confirm__desc">
              &ldquo;{reportReason?.label}&rdquo; 사유로 신고가 접수돼요. 검토 후 조치가 이루어져요.
            </p>
            <button type="button" className="report-confirm__cancel" disabled={reporting} onClick={closeReport}>
              취소
            </button>
            <button type="button" className="report-confirm__submit" disabled={reporting} onClick={confirmReport}>
              {reporting ? '접수하는 중…' : '신고 접수하기'}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
