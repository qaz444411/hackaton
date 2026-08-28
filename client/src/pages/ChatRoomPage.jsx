import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  MoreVertical, Sparkles, Send, MapPin, Plus, Utensils, CalendarClock, Search,
} from 'lucide-react';
import AppBar from '../components/AppBar.jsx';
import ConfirmDialog from '../components/ConfirmDialog.jsx';
import { useChatSocket } from '../hooks/useChatSocket.js';
import { useMyLocation, FALLBACK_CENTER } from '../hooks/useKakaoMap.js';
import { useDebouncedValue } from '../hooks/useDebouncedValue.js';
import { formatDistance } from '../lib/format.js';
import {
  getChatRoom, getMessages, getSuggestions, useSuggestion, closeChat,
  getAiContext, updateAiContext, deleteChatRoom, getCodes, getRestaurants,
  sendRestaurantMessage, sendMeetingMessage, cancelMeeting,
} from '../api/endpoints.js';
import { useAuth } from '../context/AuthContext.jsx';
import './ChatRoomPage.css';

const time = (v) => new Date(v).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' });

const todayStr = () => new Date().toISOString().slice(0, 10);
const tomorrowStr = () => {
  const d = new Date(); d.setDate(d.getDate() + 1);
  return d.toISOString().slice(0, 10);
};
const dateLabel = (v) => {
  if (v === todayStr()) return '오늘';
  if (v === tomorrowStr()) return '내일';
  const d = new Date(v);
  return `${d.getMonth() + 1}월 ${d.getDate()}일`;
};

/**
 * 채팅 상세 페이지 — 제미나이 챗봇 API 사용 지점.
 *  · 추천 질문은 서버 /api/chat/rooms/:matchId/suggestions 가 제미나이를 호출해 생성
 *  · 프론트는 키를 갖지 않고 결과만 표시 → '입력창에 넣기'
 *  · "+" 버튼 — 식당 보내기 / 약속 잡기. 카카오 지도/목록과 같은 restaurant 테이블을 그대로 쓴다.
 */
export default function ChatRoomPage() {
  const { matchId } = useParams();
  const nav = useNavigate();
  const qc = useQueryClient();
  const { user } = useAuth();
  const [messages, setMessages] = useState([]);
  const [text, setText] = useState('');
  const [openSuggest, setOpenSuggest] = useState(false);
  const [suggestions, setSuggestions] = useState([]);
  const [menu, setMenu] = useState(false);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [confirmCancelMeeting, setConfirmCancelMeeting] = useState(false);
  const [cancellingMeeting, setCancellingMeeting] = useState(false);
  const bottomRef = useRef(null);

  // "+" 버튼 플로우 — 'menu' | 'pick-send' | 'pick-meeting' | 'datetime' | null
  const [plusStep, setPlusStep] = useState(null);
  const [keyword, setKeyword] = useState('');
  const [restaurants, setRestaurants] = useState([]);
  const [pickedRestaurant, setPickedRestaurant] = useState(null);
  const [mealDate, setMealDate] = useState(todayStr());
  const [mealTimeCode, setMealTimeCode] = useState(null);
  const [sending, setSending] = useState(false);
  const { pos: myPos } = useMyLocation({ watch: false });
  const { data: codes } = useQuery({ queryKey: ['codes'], queryFn: getCodes });

  const { data: room } = useQuery({ queryKey: ['chatRoom', matchId], queryFn: () => getChatRoom(matchId) });
  const { data: aiContext } = useQuery({ queryKey: ['aiContext'], queryFn: getAiContext });
  const { send } = useChatSocket(matchId, (m) =>
    setMessages((prev) => (prev.some((x) => x.id === m.id) ? prev : [...prev, m])));

  useEffect(() => { getMessages(matchId).then(setMessages); }, [matchId]);
  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);

  const readOnly = room?.roomStatus === 'READ_ONLY';

  const submit = async (e) => {
    e.preventDefault();
    const content = text.trim();
    if (!content) return;
    setText('');
    // 전송된 메시지는 소켓의 message:new 브로드캐스트로 나에게도 돌아오므로 여기서는 추가하지 않는다
    // (안 그러면 ack 응답과 브로드캐스트가 겹쳐 두 번 표시된다).
    const res = await send(content);
    if (!res?.ok) alert(res?.message || '메시지를 보낼 수 없습니다.');
  };

  const loadSuggestions = async () => {
    if (openSuggest) { setOpenSuggest(false); return; }
    setOpenSuggest(true);
    setSuggestions(await getSuggestions(matchId, false));
  };

  const cancelMatch = async () => {
    await closeChat(matchId);
    setConfirmCancel(false);
    nav('/chats', { replace: true });
  };

  const toggleAiContext = async () => {
    const next = !aiContext?.enabled;
    await updateAiContext(next);
    qc.invalidateQueries({ queryKey: ['aiContext'] });
    if (openSuggest) setSuggestions(await getSuggestions(matchId, false));
  };

  const deleteRoom = async () => {
    try {
      await deleteChatRoom(matchId);
      qc.invalidateQueries({ queryKey: ['chatRooms'] });
      nav('/chats', { replace: true });
    } catch (e) {
      alert(e.response?.data?.message || '삭제하지 못했어요.');
      setConfirmDelete(false);
    }
  };

  const cancelMeetingNow = async () => {
    setCancellingMeeting(true);
    try {
      await cancelMeeting(matchId);
      qc.invalidateQueries({ queryKey: ['chatRoom', matchId] });
      qc.invalidateQueries({ queryKey: ['home'] });
      setConfirmCancelMeeting(false);
    } catch (e) {
      alert(e.response?.data?.message || '약속을 취소하지 못했어요.');
    } finally {
      setCancellingMeeting(false);
    }
  };

  const closePlus = () => {
    setPlusStep(null); setKeyword(''); setRestaurants([]);
    setPickedRestaurant(null); setMealTimeCode(null); setMealDate(todayStr());
  };

  const searchRestaurants = async (kw = keyword) => {
    const pos = myPos ?? FALLBACK_CENTER;
    setRestaurants(await getRestaurants({ ...pos, radius: 2000, keyword: kw }));
  };

  const openPick = async (step) => {
    setPlusStep(step);
    await searchRestaurants('');
  };

  // 입력을 멈추면(300ms) 자동으로 검색 — 시트가 열려 있을 때만
  const debouncedKeyword = useDebouncedValue(keyword, 300);
  useEffect(() => {
    if (plusStep === 'pick-send' || plusStep === 'pick-meeting') searchRestaurants(debouncedKeyword);
  }, [debouncedKeyword]); // eslint-disable-line react-hooks/exhaustive-deps

  const sendRestaurant = async (r) => {
    setSending(true);
    try {
      await sendRestaurantMessage(matchId, r.restaurant_id);
      closePlus();
    } catch (e) {
      alert(e.response?.data?.message || '보내지 못했어요.');
    } finally {
      setSending(false);
    }
  };

  const confirmMeeting = async () => {
    if (!mealTimeCode) return;
    setSending(true);
    try {
      await sendMeetingMessage(matchId, {
        restaurantId: pickedRestaurant?.restaurant_id, mealDate, mealTimeCode,
      });
      // 약속이 잡히면 상단 약속 정보 배너(식당/시간)도 바로 바뀌어야 한다 —
      // 안 그러면 화면을 나갔다 들어와야 반영된다.
      qc.invalidateQueries({ queryKey: ['chatRoom', matchId] });
      qc.invalidateQueries({ queryKey: ['home'] });
      closePlus();
    } catch (e) {
      alert(e.response?.data?.message || '약속을 보내지 못했어요.');
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="screen">
      <AppBar
        center={
          <div className="chatroom__title">
            <img className="chatroom__avatar" src={room?.partner_image || '/avatar-default.png'} alt="" />
            <span className="chatroom__name">{room?.partner_nickname || '채팅'}</span>
          </div>
        }
        right={<button className="icon-btn" onClick={() => setMenu(!menu)}><MoreVertical size={18} /></button>}
      />

      {menu && (
        <div className="card chat-menu-card">
          <button className="btn btn--line" style={{ height: 42 }}
                  onClick={() => { setMenu(false); nav(`/chats/${matchId}/rating`); }}>밥친구 평가하기</button>
          {!readOnly && room?.meal_date && (
            <button className="btn btn--line" style={{ height: 42 }}
                    onClick={() => { setMenu(false); setConfirmCancelMeeting(true); }}>약속 취소하기</button>
          )}
          {!readOnly && (
            <button className="btn btn--line" style={{ height: 42 }}
                    onClick={() => { setMenu(false); setConfirmCancel(true); }}>매칭 취소하기</button>
          )}
          {readOnly && (
            <button className="btn btn--line" style={{ height: 42 }}
                    onClick={() => { setMenu(false); setConfirmDelete(true); }}>채팅방 삭제</button>
          )}
        </div>
      )}

      {confirmCancel && (
        <ConfirmDialog
          title="매칭을 취소하시겠습니까?"
          desc="취소하면 이 대화는 더 이상 이어갈 수 없어요."
          confirmLabel="취소하기"
          cancelLabel="닫기"
          onConfirm={cancelMatch}
          onCancel={() => setConfirmCancel(false)}
        />
      )}

      {confirmCancelMeeting && (
        <ConfirmDialog
          title="약속을 취소할까요?"
          desc="채팅은 그대로 이어져요. 식당/날짜/시간만 다시 정하면 돼요."
          confirmLabel={cancellingMeeting ? '취소하는 중…' : '약속 취소'}
          cancelLabel="약속 유지"
          onConfirm={cancelMeetingNow}
          onCancel={() => !cancellingMeeting && setConfirmCancelMeeting(false)}
        />
      )}

      {confirmDelete && (
        <ConfirmDialog
          title="채팅방을 삭제하시겠습니까?"
          desc="내 목록에서만 사라져요. 상대방 채팅방에는 남아있어요."
          confirmLabel="삭제하기"
          cancelLabel="닫기"
          onConfirm={deleteRoom}
          onCancel={() => setConfirmDelete(false)}
        />
      )}

      {room?.restaurant_name && (
        <div className="meeting-strip">
          <MapPin size={14} strokeWidth={2.2} />
          <span>{room.restaurant_name}에서 같이 먹기로 했어요 · {room.meal_time}</span>
        </div>
      )}

      <div className="chat-list">
        {messages.map((m) => {
          if (m.message_type === 'SYSTEM') {
            return <div key={m.id} className="bubble bubble--sys">{m.content}</div>;
          }
          const mine = m.sender_id === user.id;

          if (m.message_type === 'RESTAURANT' || m.message_type === 'MEETING') {
            let card = null;
            try { card = JSON.parse(m.content); } catch { /* 파싱 실패 시 카드 생략 */ }
            return (
              <div key={m.id} className={`bubble-row${mine ? ' bubble-row--me' : ''}`}>
                {!mine && <img className="bubble-row__avatar" src={room?.partner_image || '/avatar-default.png'} alt="" />}
                {card && m.message_type === 'RESTAURANT' && (
                  <div className="restaurant-card">
                    <div className="restaurant-card__img" aria-hidden="true"><Utensils size={22} strokeWidth={1.8} /></div>
                    <div className="restaurant-card__body">
                      <strong className="restaurant-card__name">{card.name}</strong>
                      <p className="restaurant-card__meta">
                        {card.category || '음식점'}{card.rating ? ` · ★${card.rating}` : ''}
                      </p>
                      <p className="restaurant-card__caption">이 음식점 어때요?</p>
                      <button type="button" className="restaurant-card__cta"
                              onClick={() => nav(`/map?restaurantId=${card.restaurantId}`)}>
                        지도에서 보기
                      </button>
                    </div>
                  </div>
                )}
                {card && m.message_type === 'MEETING' && (
                  <div className="meeting-card">
                    <div className="meeting-card__head"><CalendarClock size={13} strokeWidth={2.2} /> 식사 약속</div>
                    {card.restaurantName && <strong className="meeting-card__name">{card.restaurantName}</strong>}
                    <p className="meeting-card__when">{dateLabel(card.mealDate)} · {card.mealTimeLabel}</p>
                    <p className="meeting-card__with">{card.partnerNickname}님과 함께</p>
                    <div className="meeting-card__cta">약속을 잡았어요!</div>
                  </div>
                )}
              </div>
            );
          }

          return (
            <div key={m.id} className={`bubble-row${mine ? ' bubble-row--me' : ''}`}>
              {!mine && <img className="bubble-row__avatar" src={room?.partner_image || '/avatar-default.png'} alt="" />}
              <div className={`bubble ${mine ? 'bubble--me' : 'bubble--you'}`}>
                {m.content}
                <div style={{ fontSize: 10, opacity: .7, marginTop: 4 }}>{time(m.sent_at)}</div>
              </div>
            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>

      {/* 제미나이 대화 주제 추천 */}
      {openSuggest && (
        <div className="suggest">
          <div className="suggest__head">
            <b><Sparkles size={14} style={{ verticalAlign: -2, marginRight: 4 }} />이런 이야기 어때요?</b>
            <button type="button" className="suggest__ai-toggle" onClick={toggleAiContext}>
              대화 참고 {aiContext?.enabled ? '켜짐' : '꺼짐'}
            </button>
          </div>
          {aiContext?.enabled && (
            <p className="suggest__ai-hint">대화 내용을 참고해 질문이 계속 바뀌어요. 상대방 메시지도 함께 전송돼요.</p>
          )}
          {suggestions.map((s) => (
            <button key={s.id} className="suggest__item"
                    onClick={() => { setText(s.question); useSuggestion(s.id); setOpenSuggest(false); }}>
              {s.question}
            </button>
          ))}
        </div>
      )}

      {readOnly ? (
        <div className="chat-input"><p className="muted">종료된 대화입니다.</p></div>
      ) : (
        <form className="chat-input" onSubmit={submit}>
          <button type="button" className={`icon-btn${openSuggest ? ' icon-btn--active' : ''}`} onClick={loadSuggestions}>
            <Sparkles size={20} strokeWidth={2} />
          </button>
          <button type="button" className="icon-btn" onClick={() => setPlusStep('menu')} aria-label="더보기">
            <Plus size={20} strokeWidth={2} />
          </button>
          <input className="input" value={text} maxLength={500}
                 onChange={(e) => setText(e.target.value)} placeholder="메시지를 입력하세요..." />
          <button className="send" type="submit" disabled={!text.trim()}><Send size={16} strokeWidth={2.2} /></button>
        </form>
      )}

      {/* "+" 메뉴 — 식당 보내기 / 약속 잡기 */}
      {plusStep === 'menu' && (
        <>
          <div className="sheet-backdrop" onClick={closePlus} />
          <div className="sheet plus-menu">
            <div className="sheet__handle" onClick={closePlus} />
            <button type="button" className="plus-menu__item" onClick={() => openPick('pick-send')}>
              <span className="plus-menu__icon"><Utensils size={18} strokeWidth={2} /></span>
              식당 보내기
            </button>
            <button type="button" className="plus-menu__item" onClick={() => openPick('pick-meeting')}>
              <span className="plus-menu__icon"><CalendarClock size={18} strokeWidth={2} /></span>
              약속 잡기
            </button>
          </div>
        </>
      )}

      {/* 식당 검색/선택 — 식당 보내기, 약속 잡기 둘 다 여기서 고른다 */}
      {(plusStep === 'pick-send' || plusStep === 'pick-meeting') && (
        <>
          <div className="sheet-backdrop" onClick={closePlus} />
          <div className="sheet restaurant-sheet">
            <div className="sheet__handle" onClick={closePlus} />
            <p className="restaurant-sheet__title">
              {plusStep === 'pick-send' ? '음식점 보내기' : '약속 잡을 음식점'}
            </p>
            <label className="restaurant-sheet__search">
              <Search size={14} strokeWidth={2.2} />
              <input placeholder="음식점 검색" value={keyword}
                     onChange={(e) => setKeyword(e.target.value)}
                     onKeyDown={(e) => e.key === 'Enter' && searchRestaurants()} />
            </label>
            <div className="restaurant-sheet__list">
              {restaurants.map((r) => (
                <button type="button" key={r.restaurant_id} className="restaurant-sheet__row"
                        disabled={sending}
                        onClick={() => (plusStep === 'pick-send'
                          ? sendRestaurant(r)
                          : (() => { setPickedRestaurant(r); setPlusStep('datetime'); })())}>
                  <span className="restaurant-sheet__thumb"><Utensils size={16} strokeWidth={1.8} /></span>
                  <span className="restaurant-sheet__info">
                    <strong>{r.name}</strong>
                    <span className="restaurant-sheet__meta">
                      {formatDistance(r.distance_m)} · {r.food_type_label}
                      {r.rating ? ` · ★${r.rating}` : ''}
                    </span>
                    {r.recruiting_count > 0 && (
                      <span className="restaurant-sheet__recruit">{r.recruiting_count}명이 밥친구 찾는 중</span>
                    )}
                  </span>
                </button>
              ))}
              {!restaurants.length && <p className="muted" style={{ padding: '12px 4px' }}>주변 음식점을 찾는 중이에요…</p>}
            </div>
            {plusStep === 'pick-meeting' && (
              <button type="button" className="restaurant-sheet__skip"
                      onClick={() => { setPickedRestaurant(null); setPlusStep('datetime'); }}>
                식당은 나중에 정할게요
              </button>
            )}
          </div>
        </>
      )}

      {/* 언제 만날까요? — 날짜/시간 선택 후 약속 카드 전송 */}
      {plusStep === 'datetime' && (
        <>
          <div className="sheet-backdrop" onClick={closePlus} />
          <div className="sheet meeting-sheet">
            <div className="sheet__handle" onClick={closePlus} />
            <p className="restaurant-sheet__title">언제 만날까요?</p>

            {pickedRestaurant && (
              <div className="meeting-sheet__place">
                <span className="meeting-sheet__place-thumb"><Utensils size={14} strokeWidth={1.8} /></span>
                <span>
                  <strong>{pickedRestaurant.name}</strong>
                  <span className="meeting-sheet__place-meta">
                    {formatDistance(pickedRestaurant.distance_m)} · {pickedRestaurant.food_type_label}
                  </span>
                </span>
              </div>
            )}

            <p className="meeting-sheet__label">날짜</p>
            <div className="meeting-sheet__row">
              {[['오늘', todayStr()], ['내일', tomorrowStr()]].map(([label, v]) => (
                <button key={v} type="button"
                        className={`meeting-sheet__pill${mealDate === v ? ' meeting-sheet__pill--active' : ''}`}
                        onClick={() => setMealDate(v)}>
                  {label}
                </button>
              ))}
              <input type="date" className="meeting-sheet__date-input" value={mealDate}
                     min={todayStr()} onChange={(e) => setMealDate(e.target.value)} />
            </div>

            <p className="meeting-sheet__label">시간</p>
            <div className="meeting-sheet__row">
              {(codes?.meal || []).map((c) => (
                <button key={c.code} type="button"
                        className={`meeting-sheet__pill${mealTimeCode === c.code ? ' meeting-sheet__pill--active' : ''}`}
                        onClick={() => setMealTimeCode(c.code)}>
                  {c.label}
                </button>
              ))}
            </div>

            <button type="button" className="meeting-sheet__submit" disabled={!mealTimeCode || sending}
                    onClick={confirmMeeting}>
              {sending ? '보내는 중…' : '약속 보내기'}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
