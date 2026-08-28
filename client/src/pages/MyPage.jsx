import { useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ChevronRight, Pencil } from 'lucide-react';
import AppBar from '../components/AppBar.jsx';
import { getMyPage, getHistory, updateNotifications, updateAiContext, uploadAvatar } from '../api/endpoints.js';
import { requestNotifyPermission, notifySupported } from '../lib/notify.js';
import { useAuth } from '../context/AuthContext.jsx';
import './MyPage.css';

const SPICY = { 1: '1 / 3', 2: '2 / 3', 3: '3 / 3' };
const OILY = { 1: '1 / 3', 2: '2 / 3', 3: '3 / 3' };

/** 마이페이지 — 프로필 / 이용 현황 / 매칭 기록 / 알림 설정 / 로그아웃 */
export default function MyPage() {
  const nav = useNavigate();
  const qc = useQueryClient();
  const { signOut, setUser } = useAuth();
  const { data } = useQuery({ queryKey: ['mypage'], queryFn: getMyPage });
  const { data: history = [] } = useQuery({ queryKey: ['history'], queryFn: getHistory });
  const fileRef = useRef(null);
  const [uploading, setUploading] = useState(false);

  if (!data) return <div className="screen center">불러오는 중…</div>;
  const { profile, stats, notify } = data;

  const pickAvatar = () => fileRef.current?.click();

  const onAvatarChange = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';   // 같은 파일 다시 선택해도 change 가 뜨게
    if (!file) return;
    setUploading(true);
    try {
      const { profileImage } = await uploadAvatar(file);
      qc.invalidateQueries({ queryKey: ['mypage'] });
      setUser((u) => (u ? { ...u, profile_image: profileImage } : u));
    } catch (err) {
      alert(err.response?.data?.message || '사진을 올리지 못했어요.');
    } finally {
      setUploading(false);
    }
  };

  const toggleMarketing = async () => {
    await updateNotifications({
      matchPush: !!notify.match_push, chatPush: !!notify.chat_push, marketing: !notify.marketing,
    });
    qc.invalidateQueries({ queryKey: ['mypage'] });
  };

  // 채팅 알림 + 매칭 알림을 하나로 묶었다 — 켜는 순간 브라우저 알림 권한을 직접 물어봐서
  // 동의해야만 실제로 알림이 뜨게 한다(동의 없이 켜두면 아무 일도 안 일어나 헷갈린다).
  // 서버 설정은 켜져 있어도 브라우저 권한이 없으면(꺼졌거나 나중에 취소됐으면) 실제로는
  // 알림이 안 가므로, 체크박스는 "권한까지 있을 때"만 켜진 걸로 보여준다.
  const permissionGranted = !notifySupported() || Notification.permission === 'granted';
  const chatMatchOn = !!notify.match_push && !!notify.chat_push && permissionGranted;
  const toggleChatMatch = async () => {
    const turningOn = !chatMatchOn;
    if (turningOn) {
      const perm = await requestNotifyPermission();
      if (perm !== 'granted') {
        alert('브라우저 알림을 허용해야 실제로 알림을 받을 수 있어요. 브라우저 설정에서 알림 권한을 허용한 뒤 다시 시도해 주세요.');
        return;
      }
    }
    await updateNotifications({ matchPush: turningOn, chatPush: turningOn, marketing: !!notify.marketing });
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
            <div className="mypage__avatar-wrap">
              <img className="mypage__avatar" src={profile.profile_image || '/avatar-default.png'} alt="" />
              <button type="button" className="mypage__avatar-edit" onClick={pickAvatar}
                      disabled={uploading} aria-label="프로필 사진 변경">
                <Pencil size={12} strokeWidth={2.4} />
              </button>
              <input ref={fileRef} type="file" accept="image/*" hidden onChange={onAvatarChange} />
            </div>
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
          <label className="mypage__notify-row">
            <span>채팅·매칭 알림</span>
            <input type="checkbox" checked={chatMatchOn} onChange={toggleChatMatch} />
          </label>
          <label className="mypage__notify-row">
            <span>마케팅 정보 수신</span>
            <input type="checkbox" checked={!!notify?.marketing} onChange={toggleMarketing} />
          </label>
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
