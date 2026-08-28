import { useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ChevronRight } from 'lucide-react';
import AppBar from '../components/AppBar.jsx';
import { getMyPage, getHistory, updateNotifications, updateAiContext } from '../api/endpoints.js';
import { useAuth } from '../context/AuthContext.jsx';
import './MyPage.css';

const SPICY = { 1: '1 / 3', 2: '2 / 3', 3: '3 / 3' };
const OILY = { 1: '1 / 3', 2: '2 / 3', 3: '3 / 3' };

/** 마이페이지 — 프로필 / 이용 현황 / 매칭 기록 / 알림 설정 / 로그아웃 */
export default function MyPage() {
  const nav = useNavigate();
  const qc = useQueryClient();
  const { signOut } = useAuth();
  const { data } = useQuery({ queryKey: ['mypage'], queryFn: getMyPage });
  const { data: history = [] } = useQuery({ queryKey: ['history'], queryFn: getHistory });

  if (!data) return <div className="screen center">불러오는 중…</div>;
  const { profile, stats, notify } = data;

  const toggle = async (key) => {
    await updateNotifications({
      matchPush: !!notify.match_push, chatPush: !!notify.chat_push, marketing: !!notify.marketing,
      [key]: !notify[{ matchPush: 'match_push', chatPush: 'chat_push', marketing: 'marketing' }[key]],
    });
    qc.invalidateQueries({ queryKey: ['mypage'] });
  };

  const toggleAiContext = async () => {
    await updateAiContext(!notify?.ai_context_enabled);
    qc.invalidateQueries({ queryKey: ['mypage'] });
    qc.invalidateQueries({ queryKey: ['aiContext'] });
  };

  return (
    <div className="screen">
      <AppBar title="마이" onBack={() => nav('/home')} />
      <div className="screen__body">
        <div className="mypage__profile">
          <div className="mypage__profile-head">
            <img className="mypage__avatar" src={profile.profile_image || '/avatar-default.png'} alt="" />
            <div>
              <p className="mypage__name">{profile.nickname}</p>
              <p className="mypage__sub">{profile.age}세</p>
              <p className="mypage__sub">{profile.mbti_code} · {profile.region || '지역 미설정'}</p>
            </div>
          </div>

          <div className="mypage__divider" />

          <div className="mypage__grid">
            <div className="mypage__grid-cell"><span className="mypage__grid-label">MBTI</span><span className="mypage__grid-value">{profile.mbti_code}</span></div>
            <div className="mypage__grid-cell"><span className="mypage__grid-label">알레르기</span><span className="mypage__grid-value">{profile.has_allergy ? '있음' : '없음'}</span></div>
            <div className="mypage__grid-cell"><span className="mypage__grid-label">맵기</span><span className="mypage__grid-value">{SPICY[profile.spicy_level] ?? '-'}</span></div>
            <div className="mypage__grid-cell"><span className="mypage__grid-label">느끼함</span><span className="mypage__grid-value">{OILY[profile.oily_level] ?? '-'}</span></div>
          </div>

          {profile.interests?.length > 0 && (
            <div className="mypage__tags">
              {profile.interests.map((i) => <span key={i.id} className="mypage__tag">#{i.name}</span>)}
            </div>
          )}
        </div>

        <div className="mypage__stats-row">
          <div className="mypage__stat">
            <p className="mypage__stat-value">{stats?.meal_count ?? 0}회</p>
            <p className="mypage__stat-label">함께한 밥</p>
          </div>
          <div className="mypage__stat">
            <p className="mypage__stat-value">{stats?.buddy_count ?? 0}명</p>
            <p className="mypage__stat-label">만난 밥친구</p>
          </div>
        </div>

        <div className="mypage__menu">
          <button type="button" className="mypage__menu-item" onClick={() => nav('/preference')}>
            <span className="mypage__menu-title">취향 설정 변경</span>
            <ChevronRight size={16} strokeWidth={2} className="mypage__menu-arrow" />
          </button>
          <button type="button" className="mypage__menu-item" onClick={() => nav('/inbox')}>
            <div>
              <p className="mypage__menu-title">매칭 관리</p>
              <p className="mypage__menu-desc">내가 보내고 받은 매칭 요청을 관리해요</p>
            </div>
            <ChevronRight size={16} strokeWidth={2} className="mypage__menu-arrow" />
          </button>
        </div>

        <h2 className="section-title">알림 설정</h2>
        <div className="card">
          {[['matchPush', '매칭 알림', 'match_push'],
            ['chatPush', '채팅 알림', 'chat_push'],
            ['marketing', '마케팅 정보 수신', 'marketing']].map(([key, label, col]) => (
            <label key={key} className="mypage__notify-row">
              <span>{label}</span>
              <input type="checkbox" checked={!!notify?.[col]} onChange={() => toggle(key)} />
            </label>
          ))}
          <label className="mypage__notify-row">
            <span>AI가 채팅 대화 내용 참고하기</span>
            <input type="checkbox" checked={!!notify?.ai_context_enabled} onChange={toggleAiContext} />
          </label>
        </div>

        <h2 className="section-title">매칭 기록</h2>
        <div className="list" style={{ paddingBottom: 8 }}>
          {history.map((h) => (
            <div key={h.match_id} className="mypage__history-item">
              <img className="mypage__history-avatar" src={h.partner_image || '/avatar-default.png'} alt="" />
              <div className="mypage__history-body">
                <p className="mypage__history-name">{h.partner_nickname}</p>
                <p className="mypage__history-sub">{h.restaurant_name || h.food_type} · {h.meal_time}</p>
              </div>
              <span className="mypage__history-status">
                {h.status === 'COMPLETED' ? '완료' : h.status === 'CANCELLED' ? '취소' : '예정'}
              </span>
            </div>
          ))}
          {!history.length && <p className="muted">아직 매칭 기록이 없어요.</p>}
        </div>

        <button type="button" className="mypage__logout"
                onClick={() => { signOut(); nav('/', { replace: true }); }}>
          로그아웃
        </button>
      </div>
    </div>
  );
}
