import { useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import AppBar from '../components/AppBar.jsx';
import BottomNav from '../components/BottomNav.jsx';
import { getMyPage, getHistory, updateNotifications } from '../api/endpoints.js';
import { useAuth } from '../context/AuthContext.jsx';
import './MyPage.css';

const SPICY = { 1: '순한맛', 2: '보통', 3: '아주 매운맛' };

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

  return (
    <div className="screen">
      <AppBar title="마이페이지" back={false} />
      <div className="screen__body">
        <div className="card mypage__profile">
          <img className="mypage__avatar" src={profile.profile_image || '/avatar-default.png'} alt="" />
          <p className="mypage__name">{profile.nickname}</p>
          <p className="mypage__sub">
            {profile.age}세 · {profile.gender === 'MALE' ? '남성' : '여성'} · {profile.mbti_code}
          </p>
          <div className="mypage__tags">
            {(profile.interests || []).map((i) => <span key={i.id} className="tag">#{i.name}</span>)}
          </div>
          <p className="mypage__sub" style={{ marginTop: 10 }}>
            알레르기 {profile.has_allergy ? '있음' : '없음'} · 매운맛 {SPICY[profile.spicy_level]}
          </p>
        </div>

        <h2 className="section-title">이용 현황</h2>
        <div className="card mypage__stats-row">
          <div className="mypage__stat">
            <p className="mypage__stat-value">{stats?.meal_count ?? 0}</p>
            <p className="mypage__stat-label">함께한 밥</p>
          </div>
          <div className="mypage__stat">
            <p className="mypage__stat-value">{stats?.buddy_count ?? 0}</p>
            <p className="mypage__stat-label">만난 밥친구</p>
          </div>
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
        </div>

        <h2 className="section-title">매칭 기록</h2>
        <div className="list">
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

        <button type="button" className="btn btn--line mypage__logout"
                onClick={() => { signOut(); nav('/', { replace: true }); }}>
          로그아웃
        </button>
      </div>
      <BottomNav />
    </div>
  );
}
