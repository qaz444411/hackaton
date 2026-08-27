import { useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import AppBar from '../components/AppBar.jsx';
import BottomNav from '../components/BottomNav.jsx';
import { getMyPage, getHistory, updateNotifications } from '../api/endpoints.js';
import { useAuth } from '../context/AuthContext.jsx';

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
        <div className="card" style={{ textAlign: 'center' }}>
          <img className="avatar avatar--lg" style={{ margin: '0 auto' }}
               src={profile.profile_image || '/avatar-default.png'} alt="" />
          <h2 style={{ marginTop: 10 }}>{profile.nickname}</h2>
          <p className="muted">
            {profile.age}세 · {profile.gender === 'MALE' ? '남성' : '여성'} · {profile.mbti_code}
          </p>
          <div className="row" style={{ justifyContent: 'center', gap: 6, marginTop: 10, flexWrap: 'wrap' }}>
            {(profile.interests || []).map((i) => <span key={i.id} className="tag">#{i.name}</span>)}
          </div>
          <p className="muted" style={{ marginTop: 10 }}>
            알레르기 {profile.has_allergy ? '있음' : '없음'} · 매운맛 {SPICY[profile.spicy_level]}
          </p>
        </div>

        <h2 className="section-title">이용 현황</h2>
        <div className="row">
          <div className="card" style={{ flex: 1, textAlign: 'center' }}>
            <div style={{ fontSize: 24, fontWeight: 800, color: 'var(--c-primary)' }}>{stats?.meal_count ?? 0}</div>
            <div className="muted">함께한 밥</div>
          </div>
          <div className="card" style={{ flex: 1, textAlign: 'center' }}>
            <div style={{ fontSize: 24, fontWeight: 800, color: 'var(--c-primary)' }}>{stats?.buddy_count ?? 0}</div>
            <div className="muted">만난 밥친구</div>
          </div>
        </div>

        <h2 className="section-title">알림 설정</h2>
        <div className="card">
          {[['matchPush', '매칭 알림', 'match_push'],
            ['chatPush', '채팅 알림', 'chat_push'],
            ['marketing', '마케팅 정보 수신', 'marketing']].map(([key, label, col]) => (
            <label key={key} className="row"
                   style={{ justifyContent: 'space-between', padding: '8px 0' }}>
              <span>{label}</span>
              <input type="checkbox" checked={!!notify?.[col]} onChange={() => toggle(key)} />
            </label>
          ))}
        </div>

        <h2 className="section-title">매칭 기록</h2>
        <div className="list">
          {history.map((h) => (
            <div key={h.match_id} className="card">
              <div className="list-item">
                <img className="avatar" src={h.partner_image || '/avatar-default.png'} alt="" />
                <div className="list-item__body">
                  <strong>{h.partner_nickname}</strong>
                  <div className="muted ellipsis">
                    {h.restaurant_name || h.food_type} · {h.meal_time}
                  </div>
                </div>
                <span className="muted">{h.status === 'COMPLETED' ? '완료' : h.status === 'CANCELLED' ? '취소' : '예정'}</span>
              </div>
            </div>
          ))}
          {!history.length && <p className="muted">아직 매칭 기록이 없어요.</p>}
        </div>

        <button className="btn btn--line" style={{ margin: '24px 0' }}
                onClick={() => { signOut(); nav('/', { replace: true }); }}>
          로그아웃
        </button>
      </div>
      <BottomNav />
    </div>
  );
}
