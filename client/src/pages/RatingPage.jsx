import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import AppBar from '../components/AppBar.jsx';
import ConfirmDialog from '../components/ConfirmDialog.jsx';
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
  { code: 'SPAM', label: '스팸·도배' },
  { code: 'ABUSE', label: '욕설·괴롭힘' },
  { code: 'SEXUAL', label: '성적 불쾌감' },
  { code: 'NOSHOW', label: '약속 불이행(노쇼)' },
  { code: 'FRAUD', label: '사기·허위정보' },
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
  const [reportOpen, setReportOpen] = useState(false);
  const [reportReason, setReportReason] = useState(null);
  const [reporting, setReporting] = useState(false);

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
      await reportChat(matchId, { reasonCode: reportReason.code });
      nav('/chats', { replace: true });
    } catch (e) {
      alert(e.response?.data?.message || '신고하지 못했어요.');
      setReporting(false);
      setReportReason(null);
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
          <button type="button" className="rating__report-link" onClick={() => setReportOpen(true)}>신고하기</button>
        </div>
      </div>

      <div className="rating__footer">
        <button type="button" className="rating__submit" disabled={!score || submitting} onClick={submit}>
          {submitting ? '보내는 중…' : '평가 완료'}
        </button>
      </div>

      {reportOpen && (
        <>
          <div className="sheet-backdrop" onClick={() => setReportOpen(false)} />
          <div className="sheet plus-menu">
            <div className="sheet__handle" onClick={() => setReportOpen(false)} />
            {REPORT_REASONS.map((r) => (
              <button key={r.code} type="button" className="plus-menu__item"
                      onClick={() => { setReportOpen(false); setReportReason(r); }}>
                {r.label}
              </button>
            ))}
          </div>
        </>
      )}

      {reportReason && (
        <ConfirmDialog
          title="신고하고 매칭을 종료할까요?"
          desc={`"${reportReason.label}"로 신고해요. 신고하면 이 매칭 대화가 종료되고 되돌릴 수 없어요.`}
          confirmLabel={reporting ? '신고하는 중…' : '신고하기'}
          cancelLabel="취소"
          onCancel={() => !reporting && setReportReason(null)}
          onConfirm={confirmReport}
        />
      )}
    </div>
  );
}
