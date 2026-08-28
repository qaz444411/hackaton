import { Router } from 'express';
import { z } from 'zod';
import { q, one, pool } from '../db/pool.js';
import { auth } from '../middlewares/auth.js';
import { wrap } from '../middlewares/error.js';
import { suggestQuestions } from '../services/ai.service.js';

const r = Router();
r.use(auth);

// "+" → 랜덤 메뉴 복권 — 한식/중식/양식/일식/기타를 아우르는 약 50개 중 하나.
// 홈 화면의 "랜덤 메뉴" 버튼과 같은 목록을 쓴다(둘 다 "뭐 먹지" 고민을 덜어주는 기능).
const LOTTERY_MENU_POOL = [
  '제육볶음', '김치찌개', '된장찌개', '순두부찌개', '비빔밥', '불고기', '삼겹살', '갈비탕',
  '냉면', '떡볶이', '김밥', '칼국수', '순대국', '육개장', '잡채밥',
  '짜장면', '짬뽕', '탕수육', '마파두부', '볶음밥', '유린기', '깐풍기', '양장피', '라조기', '고추잡채',
  '파스타', '스테이크', '피자', '리조또', '햄버거', '샌드위치', '오믈렛', '그라탱', '감바스', '스튜',
  '초밥', '라멘', '돈카츠', '우동', '규동', '오코노미야키', '텐동', '가라아게',
  '쌀국수', '팟타이', '마라탕', '마라샹궈', '카레', '나시고랭', '케밥',
];

/** 채팅 목록 페이지 (내가 삭제한 방은 제외) */
r.get('/rooms', wrap(async (req, res) => {
  const rows = await q(
    `SELECT * FROM v_chat_list
      WHERE user_id = :u
        AND match_id NOT IN (SELECT match_id FROM chat_room_hidden WHERE user_id = :u)
      ORDER BY COALESCE(last_message_at, "1970-01-01") DESC`,
    { u: req.user.id });
  res.json(rows);
}));

/**
 * 채팅방 삭제 — 실제로는 "내 목록에서만" 숨긴다(상대 기록은 남는다).
 * 대화 중(OPEN)에 숨기면 상대가 보낸 메시지가 계속 쌓이는데 나는 못 보게 되므로,
 * 종료된(READ_ONLY) 대화만 허용한다.
 */
r.delete('/rooms/:matchId', wrap(async (req, res) => {
  const guard = await one(
    `SELECT cr.status FROM chat_room cr
       JOIN match_participant mp ON mp.match_id = cr.match_id AND mp.user_id = :u
      WHERE cr.match_id = :m`,
    { m: req.params.matchId, u: req.user.id });
  if (!guard) return res.status(404).json({ message: '채팅방을 찾을 수 없습니다.' });
  if (guard.status === 'OPEN') {
    return res.status(409).json({ message: '진행 중인 대화는 매칭을 먼저 종료해야 삭제할 수 있어요.' });
  }
  await pool.execute(
    'INSERT IGNORE INTO chat_room_hidden (match_id, user_id) VALUES (:m, :u)',
    { m: req.params.matchId, u: req.user.id });
  res.json({ ok: true });
}));

/** 채팅 상세 헤더 — 상대 정보 + 약속(음식점) 정보 */
r.get('/rooms/:matchId', wrap(async (req, res) => {
  const room = await one(
    `SELECT * FROM v_home_confirmed_match WHERE user_id = :u AND match_id = :m`,
    { u: req.user.id, m: req.params.matchId });
  if (!room) return res.status(404).json({ message: '채팅방을 찾을 수 없습니다.' });
  const status = await one('SELECT status FROM chat_room WHERE match_id = :m', { m: req.params.matchId });
  res.json({ ...room, roomStatus: status.status });
}));

/** 메시지 조회 (커서 페이징) */
r.get('/rooms/:matchId/messages', wrap(async (req, res) => {
  const guard = await one(
    'SELECT 1 AS ok FROM match_participant WHERE match_id=:m AND user_id=:u',
    { m: req.params.matchId, u: req.user.id });
  if (!guard) return res.status(403).json({ message: '참여자가 아닙니다.' });

  const rows = await q(
    `SELECT id, sender_id, message_type, content, sent_at, read_at
       FROM chat_message WHERE match_id=:m AND (:before = 0 OR id < :before)
      ORDER BY id DESC LIMIT 50`,
    { m: req.params.matchId, before: Number(req.query.before || 0) });

  await q(`UPDATE chat_message SET read_at = NOW()
            WHERE match_id=:m AND read_at IS NULL AND (sender_id IS NULL OR sender_id <> :u)`,
    { m: req.params.matchId, u: req.user.id });
  res.json(rows.reverse());
}));

/** 메시지 전송 (REST — 소켓과 동일 로직) */
r.post('/rooms/:matchId/messages', wrap(async (req, res) => {
  const b = z.object({ content: z.string().min(1).max(500) }).parse(req.body);
  // 참여자인지·방이 열려있는지 먼저 확인 — 없으면 matchId 만 알아도 남의 채팅방에 메시지를 넣을 수 있었다(IDOR).
  await assertOpenRoom(req, req.params.matchId);
  const [ins] = await pool.execute(
    `INSERT INTO chat_message (match_id, sender_id, message_type, content)
     VALUES (:m, :u, 'TEXT', :c)`,
    { m: req.params.matchId, u: req.user.id, c: b.content });
  res.status(201).json(await one('SELECT * FROM chat_message WHERE id = :id', { id: ins.insertId }));
}));

/** 방 참여자인지 + 열려 있는지 확인. 아니면 던진다. */
async function assertOpenRoom(req, matchId) {
  const guard = await one(
    `SELECT cr.status FROM chat_room cr
       JOIN match_participant mp ON mp.match_id = cr.match_id AND mp.user_id = :u
      WHERE cr.match_id = :m`,
    { m: matchId, u: req.user.id });
  if (!guard) { const e = new Error('참여자가 아닙니다.'); e.status = 403; throw e; }
  if (guard.status !== 'OPEN') { const e = new Error('종료된 대화입니다.'); e.status = 409; throw e; }
}

/** "+" → 식당 보내기 — 카드형 메시지. 지도/목록과 같은 restaurant 테이블을 그대로 참조한다. */
r.post('/rooms/:matchId/restaurant', wrap(async (req, res) => {
  const matchId = Number(req.params.matchId);
  const b = z.object({ restaurantId: z.number().int() }).parse(req.body);
  await assertOpenRoom(req, matchId);

  const rest = await one(
    `SELECT id, name, road_address, rating, category_name, place_url, food_type_code
       FROM restaurant WHERE id = :id`, { id: b.restaurantId });
  if (!rest) return res.status(404).json({ message: '음식점을 찾을 수 없어요.' });

  const card = {
    restaurantId: rest.id, name: rest.name,
    category: rest.category_name || rest.food_type_code, rating: rest.rating,
    address: rest.road_address, placeUrl: rest.place_url,
  };
  const [ins] = await pool.execute(
    `INSERT INTO chat_message (match_id, sender_id, message_type, content)
     VALUES (:m, :u, 'RESTAURANT', :c)`,
    { m: matchId, u: req.user.id, c: JSON.stringify(card) });
  const msg = await one('SELECT * FROM chat_message WHERE id = :id', { id: ins.insertId });
  req.app.get('io')?.to(`room:${matchId}`).emit('message:new', msg);
  res.status(201).json(msg);
}));

/**
 * "+" → 랜덤 메뉴 복권 — 누르는 즉시 서버가 메뉴를 하나 확정해서 카드형 메시지로
 * 남긴다. 같은 메시지를 두 사람이 함께 보므로(소켓 브로드캐스트) 누가 먼저 긁든
 * 항상 같은 메뉴가 나온다 — 프론트는 그 값을 긁기 전까지만 가려서 보여줄 뿐이다.
 */
r.post('/rooms/:matchId/lottery', wrap(async (req, res) => {
  const matchId = Number(req.params.matchId);
  await assertOpenRoom(req, matchId);

  const menu = LOTTERY_MENU_POOL[Math.floor(Math.random() * LOTTERY_MENU_POOL.length)];
  const [ins] = await pool.execute(
    `INSERT INTO chat_message (match_id, sender_id, message_type, content)
     VALUES (:m, :u, 'LOTTERY', :c)`,
    { m: matchId, u: req.user.id, c: JSON.stringify({ menu }) });
  const msg = await one('SELECT * FROM chat_message WHERE id = :id', { id: ins.insertId });
  req.app.get('io')?.to(`room:${matchId}`).emit('message:new', msg);
  res.status(201).json(msg);
}));

/**
 * "+" → 약속 잡기 — 식당 + 날짜/시간을 카드형 메시지로 남긴다.
 * meal_match 에도 반영해서 홈 화면 "확정된 매칭" 카드와 채팅 상단 약속 정보가 같이 갱신되게 한다.
 */
r.post('/rooms/:matchId/meeting', wrap(async (req, res) => {
  const matchId = Number(req.params.matchId);
  const b = z.object({
    restaurantId: z.number().int().optional(),
    mealDate: z.string(),           // 'YYYY-MM-DD'
    mealTimeCode: z.string(),       // 'LUNCH' | 'DINNER' 등 meal_time_code
  }).parse(req.body);
  await assertOpenRoom(req, matchId);

  const [partner, mealTime] = await Promise.all([
    one('SELECT u.nickname FROM match_participant mp JOIN users u ON u.id = mp.user_id WHERE mp.match_id=:m AND mp.user_id<>:u',
      { m: matchId, u: req.user.id }),
    one('SELECT label FROM meal_time_code WHERE code = :c', { c: b.mealTimeCode }),
  ]);
  if (!mealTime) return res.status(400).json({ message: '알 수 없는 식사 시간이에요.' });

  let restName = null;
  if (b.restaurantId) {
    const rest = await one('SELECT name FROM restaurant WHERE id = :id', { id: b.restaurantId });
    restName = rest?.name ?? null;
  }

  const card = {
    restaurantId: b.restaurantId ?? null, restaurantName: restName,
    mealDate: b.mealDate, mealTimeLabel: mealTime.label, partnerNickname: partner?.nickname,
  };
  const [ins] = await pool.execute(
    `INSERT INTO chat_message (match_id, sender_id, message_type, content)
     VALUES (:m, :u, 'MEETING', :c)`,
    { m: matchId, u: req.user.id, c: JSON.stringify(card) });
  const msg = await one('SELECT * FROM chat_message WHERE id = :id', { id: ins.insertId });
  req.app.get('io')?.to(`room:${matchId}`).emit('message:new', msg);

  // 베스트 에포트 — 실패해도 메시지 전송 자체는 이미 끝났으니 메시지는 살린다.
  // "함께한 밥/만난 밥친구" 통계는 실제로 약속(날짜+식당)이 잡힌 매칭만 세야 하므로
  // (v_user_stats 는 status='COMPLETED' 만 집계, ck_match_scheduled 가 이를 강제한다)
  // 식당까지 정해졌을 때만 SCHEDULED 로 올린다. 날짜/시간만 잡았으면 CONFIRMED 그대로 둔다.
  try {
    await q(
      `UPDATE meal_match SET meal_date = :d, meal_time_code = :t
              ${b.restaurantId ? ", restaurant_id = :r, status = IF(status = 'CONFIRMED', 'SCHEDULED', status)" : ''}
        WHERE id = :m`,
      { d: b.mealDate, t: b.mealTimeCode, r: b.restaurantId, m: matchId });
  } catch { /* 매칭 요약 갱신 실패는 무시 — 메시지는 이미 전송됨 */ }

  res.status(201).json(msg);
}));

/**
 * 잡은 약속(식당/날짜/시간) 취소 — 채팅(매칭) 자체는 유지하고 약속 정보만 지운다.
 * SCHEDULED였다면 CONFIRMED로 되돌린다(v14 패치로 트리거에서 허용). 이미 CONFIRMED
 * 상태(식당 없이 날짜만 잡았던 경우)면 상태는 그대로 두고 필드만 지운다.
 */
r.post('/rooms/:matchId/meeting/cancel', wrap(async (req, res) => {
  const matchId = Number(req.params.matchId);
  await assertOpenRoom(req, matchId);

  const before = await one('SELECT meal_date FROM meal_match WHERE id = :m', { m: matchId });
  if (!before?.meal_date) return res.status(409).json({ message: '취소할 약속이 없어요.' });

  await q(
    `UPDATE meal_match
        SET meal_date = NULL, restaurant_id = NULL,
            status = IF(status = 'SCHEDULED', 'CONFIRMED', status)
      WHERE id = :m`,
    { m: matchId });

  const [ins] = await pool.execute(
    `INSERT INTO chat_message (match_id, sender_id, message_type, content)
     VALUES (:m, NULL, 'SYSTEM', :c)`,
    { m: matchId, c: `${req.user.nickname}님이 약속을 취소했어요.` });
  const msg = await one('SELECT * FROM chat_message WHERE id = :id', { id: ins.insertId });
  req.app.get('io')?.to(`room:${matchId}`).emit('message:new', msg);

  res.json({ ok: true });
}));

/** 밥친구 평가 — 기존에 남긴 평가가 있으면 같이 돌려준다(수정 진입용). */
r.get('/rooms/:matchId/rating', wrap(async (req, res) => {
  const matchId = Number(req.params.matchId);
  const guard = await one('SELECT 1 AS ok FROM match_participant WHERE match_id=:m AND user_id=:u',
    { m: matchId, u: req.user.id });
  if (!guard) return res.status(403).json({ message: '참여자가 아닙니다.' });

  const rating = await one(
    'SELECT score, tags FROM match_rating WHERE match_id=:m AND rater_id=:u', { m: matchId, u: req.user.id });
  res.json(rating ? { score: rating.score, tags: rating.tags ? rating.tags.split(',') : [] } : null);
}));

/**
 * 밥친구 평가 제출 — 상대에게는 공개하지 않고 저장만 한다(다음 매칭 가중치 반영은 별도 작업).
 * 매칭당 한 사람이 한 번만 평가하므로(uq_match_rating) 같은 사람이 다시 보내면 덮어쓴다.
 */
r.post('/rooms/:matchId/rating', wrap(async (req, res) => {
  const matchId = Number(req.params.matchId);
  const b = z.object({
    score: z.number().int().min(1).max(5),
    tags: z.array(z.string()).max(6).optional(),
  }).parse(req.body);

  const partner = await one(
    'SELECT user_id FROM match_participant WHERE match_id=:m AND user_id<>:u', { m: matchId, u: req.user.id });
  if (!partner) return res.status(403).json({ message: '참여자가 아닙니다.' });

  const tags = (b.tags ?? []).join(',') || null;
  await pool.execute(
    `INSERT INTO match_rating (match_id, rater_id, rated_id, score, tags)
     VALUES (:m, :u, :p, :s, :t)
     ON DUPLICATE KEY UPDATE score = VALUES(score), tags = VALUES(tags)`,
    { m: matchId, u: req.user.id, p: partner.user_id, s: b.score, t: tags });
  res.json({ ok: true });
}));

/**
 * 대화 주제 추천 — 제미나이 챗봇 API 가 들어가는 자리.
 * 두 사람의 공통 관심사·MBTI·음식점을 프롬프트로 넘겨 질문 3개를 받는다.
 * '다른 질문 보기' 는 refresh=1 로 재호출.
 * "AI 대화 참고"를 켠 사용자는 최근 대화를 반영해 매번 새로 만든다 — 대화가
 * 진행될수록 질문이 계속 바뀌어야 하는 기능이라 캐시를 그대로 두면 의미가 없다.
 */
r.get('/rooms/:matchId/suggestions', wrap(async (req, res) => {
  const matchId = Number(req.params.matchId);
  const guard = await one('SELECT 1 AS ok FROM match_participant WHERE match_id=:m AND user_id=:u',
    { m: matchId, u: req.user.id });
  if (!guard) return res.status(403).json({ message: '참여자가 아닙니다.' });

  const pref = await one(
    'SELECT ai_context_enabled FROM user_notification_setting WHERE user_id = :u', { u: req.user.id });

  if (!req.query.refresh && !pref?.ai_context_enabled) {
    const cached = await q(
      'SELECT id, question FROM chat_suggested_question WHERE match_id=:m AND used_at IS NULL ORDER BY id DESC LIMIT 3',
      { m: matchId });
    if (cached.length === 3) return res.json(cached);
  }

  const ctx = await one(
    `SELECT r.name AS restaurant_name, ft.label AS food_type,
            (SELECT GROUP_CONCAT(DISTINCT i.name)
               FROM user_interest a
               JOIN user_interest b ON b.interest_id = a.interest_id AND b.user_id <> a.user_id
               JOIN interest i ON i.id = a.interest_id
              WHERE a.user_id IN (SELECT user_id FROM match_participant WHERE match_id = m.id)
                AND b.user_id IN (SELECT user_id FROM match_participant WHERE match_id = m.id)
            ) AS common_interests
       FROM meal_match m
       JOIN food_type_code ft ON ft.code = m.food_type_code
       LEFT JOIN restaurant r ON r.id = m.restaurant_id
      WHERE m.id = :m`, { m: matchId });

  // 최근 대화 참고는 명시적으로 켠 사용자만 — 상대방 메시지도 함께 넘어가므로 기본은 꺼둔다.
  if (pref?.ai_context_enabled) {
    const recent = await q(
      `SELECT sender_id, content FROM chat_message
        WHERE match_id = :m AND message_type = 'TEXT'
        ORDER BY id DESC LIMIT 8`, { m: matchId });
    if (recent.length) {
      ctx.recent_conversation = recent.reverse()
        .map((m) => `${m.sender_id === req.user.id ? '나' : '상대'}: ${m.content}`)
        .join('\n');
    }
  }

  const { questions, source } = await suggestQuestions(ctx);
  for (const question of questions) {
    await pool.execute(
      'INSERT INTO chat_suggested_question (match_id, question, source) VALUES (:m, :q, :s)',
      { m: matchId, q: question, s: source });
  }
  const rows = await q(
    'SELECT id, question FROM chat_suggested_question WHERE match_id=:m ORDER BY id DESC LIMIT 3', { m: matchId });
  res.json(rows);
}));

/** '입력창에 넣기' 클릭 로그 */
r.post('/suggestions/:id/use', wrap(async (req, res) => {
  await q('UPDATE chat_suggested_question SET used_at = NOW() WHERE id = :id', { id: req.params.id });
  res.json({ ok: true });
}));

/**
 * 매칭 종료를 상대에게 회색 시스템 메시지로 알린다.
 * 반드시 meal_match 상태를 CANCELLED 로 바꾸기 "전에" 넣어야 한다 — 트리거가
 * 채팅방을 READ_ONLY 로 돌리는 순간부터는 메시지 INSERT 자체가 막힌다.
 */
async function announceMatchEnd(req, matchId) {
  const [ins] = await pool.execute(
    `INSERT INTO chat_message (match_id, sender_id, message_type, content)
     VALUES (:m, NULL, 'SYSTEM', :c)`,
    { m: matchId, c: `${req.user.nickname}님이 매칭을 종료했어요.` });
  const msg = await one('SELECT * FROM chat_message WHERE id = :id', { id: ins.insertId });
  req.app.get('io')?.to(`room:${matchId}`).emit('message:new', msg);
}

/** 신고하고 나가기 / 강제 종료 */
r.post('/rooms/:matchId/report', wrap(async (req, res) => {
  const b = z.object({ reasonCode: z.string(), detail: z.string().max(300).optional() }).parse(req.body);
  const partner = await one(
    'SELECT user_id FROM match_participant WHERE match_id=:m AND user_id<>:u', { m: req.params.matchId, u: req.user.id });
  await q(`INSERT INTO user_report (match_id, reporter_id, reported_id, reason_code, detail)
           VALUES (:m, :u, :p, :r, :d)`,
    { m: req.params.matchId, u: req.user.id, p: partner.user_id, r: b.reasonCode, d: b.detail ?? null });
  await announceMatchEnd(req, req.params.matchId);
  await q(`UPDATE meal_match SET status='CANCELLED', cancelled_at=NOW(), cancelled_by=:u WHERE id=:m`,
    { u: req.user.id, m: req.params.matchId });   // 트리거가 채팅방을 READ_ONLY 로 전환
  res.json({ ok: true });
}));

r.post('/rooms/:matchId/close', wrap(async (req, res) => {
  await announceMatchEnd(req, req.params.matchId);
  await q(`UPDATE meal_match SET status='CANCELLED', cancelled_at=NOW(), cancelled_by=:u WHERE id=:m`,
    { u: req.user.id, m: req.params.matchId });
  res.json({ ok: true });
}));

export default r;
