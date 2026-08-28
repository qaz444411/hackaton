import { Router } from 'express';
import { z } from 'zod';
import { q, one, pool } from '../db/pool.js';
import { auth } from '../middlewares/auth.js';
import { wrap } from '../middlewares/error.js';
import { findCandidates } from '../services/matching.service.js';

const r = Router();
r.use(auth);

// 진짜 랜덤 매칭은 취향 조건을 안 받지만 matching_request 의 food/talk/meal/price
// 컬럼은 NOT NULL 이라 중립값을 채워야 한다. meal_time_code 는 기록용으로만 쓰이므로
// 지금 시간대에 맞는 값을 골라 넣는다(실제 매칭 필터링에는 전혀 안 쓰인다).
function currentMealTimeCode() {
  const h = new Date().getHours();
  if (h < 11) return 'BREAKFAST';
  if (h < 17) return 'LUNCH';
  return 'DINNER';
}

/** 취향 선택 페이지 — 조건 임시 저장(DRAFT). 사용자당 활성 1건이라 있으면 갱신 */
r.post('/draft', wrap(async (req, res) => {
  const b = z.object({
    matchingType: z.enum(['RANDOM', 'MAP', 'SPOT']).default('RANDOM'),
    restaurantId: z.number().int().nullable().optional(),
    spotId: z.number().int().nullable().optional(),
    foodTypeCode: z.string(), talkStyleCode: z.string(), mealTimeCode: z.string(),
    priceMin: z.number().int(), priceMax: z.number().int(),
  })
    // DB의 ck_mr_map / ck_mr_spot 위반을 500 대신 400 으로 먼저 잡는다
    .refine((v) => (v.matchingType === 'MAP') === (v.restaurantId != null),
      { message: 'MAP 매칭은 restaurantId 가 필요합니다.' })
    .refine((v) => (v.matchingType === 'SPOT') === (v.spotId != null),
      { message: 'SPOT 매칭은 spotId 가 필요합니다.' })
    .parse(req.body);

  // MAP 은 (restaurant_id, food_type_code) 복합 FK 라 음식 종류가 식당과 달라지면 INSERT 가 깨진다.
  // 사용자가 고른 값 대신 식당의 실제 종류로 맞춰 준다.
  if (b.matchingType === 'MAP') {
    const rest = await one('SELECT food_type_code FROM restaurant WHERE id = :id', { id: b.restaurantId });
    if (!rest) return res.status(404).json({ message: '음식점을 찾을 수 없습니다.' });
    b.foodTypeCode = rest.food_type_code;
  }

  // matching_request.active_user_id 는 DRAFT/SEARCHING만 잡는 생성 컬럼이라, 매칭이
  // CONFIRMED로 확정된 순간부터는 이 아래 uq_matching_request_active 제약이 안 걸린다.
  // 그래서 이미 확정 매칭이 있는 사람도 새 검색을 또 시작할 수 있었고, 그게 성사돼서
  // 수락 단계까지 가면 그제서야 trg_match_participant_ins 트리거가 막아서 사용자 눈엔
  // "이미 매칭이 있다"는 원시 에러로 아주 늦게(수락 시점에) 터졌다 — 여기서 먼저 막는다.
  const confirmedMatch = await one(
    `SELECT m.id FROM match_participant mp JOIN meal_match m ON m.id = mp.match_id
      WHERE mp.user_id = :u AND m.status IN ('CONFIRMED','SCHEDULED')`,
    { u: req.user.id });
  if (confirmedMatch) {
    return res.status(409).json({ message: '이미 확정된 매칭이 있어요. 매칭 관리에서 확인해보세요.' });
  }

  const active = await one(
    "SELECT id, status FROM matching_request WHERE active_user_id = :u", { u: req.user.id });

  if (active && active.status === 'DRAFT') {
    await q(`UPDATE matching_request
                SET matching_type=:t, restaurant_id=:r, spot_id=:s, food_type_code=:f, talk_style_code=:ts,
                    meal_time_code=:mt, price_min=:pmin, price_max=:pmax
              WHERE id=:id`,
      { t: b.matchingType, r: b.restaurantId ?? null, s: b.spotId ?? null,
        f: b.foodTypeCode, ts: b.talkStyleCode,
        mt: b.mealTimeCode, pmin: b.priceMin, pmax: b.priceMax, id: active.id });
    return res.json({ id: active.id, status: 'DRAFT' });
  }
  if (active) return res.status(409).json({ message: '이미 진행 중인 매칭이 있습니다.', id: active.id });

  const [ins] = await pool.execute(
    `INSERT INTO matching_request
       (user_id, matching_type, restaurant_id, spot_id, food_type_code, talk_style_code, meal_time_code, price_min, price_max)
     VALUES (:u, :t, :r, :s, :f, :ts, :mt, :pmin, :pmax)`,
    { u: req.user.id, t: b.matchingType, r: b.restaurantId ?? null, s: b.spotId ?? null,
      f: b.foodTypeCode, ts: b.talkStyleCode, mt: b.mealTimeCode,
      pmin: b.priceMin, pmax: b.priceMax });
  res.status(201).json({ id: ins.insertId, status: 'DRAFT' });
}));

/**
 * "진짜 랜덤 매칭" — 조건 없이 누르면 즉시 시작, 같은 모드로 먼저 기다리던 사람이 있으면
 * 그 자리에서 바로 확정 매칭까지 만든다(수락 절차 없음). 취향 랜덤(RANDOM) 풀과는
 * matching_type='BLIND' 로 완전히 분리돼 있어 서로 섞이지 않는다.
 * 기존 제안 수락 절차(sp_accept_proposal)를 그대로 재사용한다 — proposal.routes.js 의
 * /:id/accept 와 똑같이 세션 변수(@mid) 스코프 때문에 프로시저 호출과 그 결과 조회를
 * 같은 커넥션에서 해야 해서 트랜잭션으로 감싸지 않고 pool.getConnection() 을 그대로 쓴다
 * (sp_accept_proposal 이 내부에서 자체 START TRANSACTION/COMMIT 을 쓰기 때문에, 바깥에서
 * 트랜잭션을 열면 그 안에서 암묵적으로 커밋되며 락이 풀려버린다).
 */
r.post('/blind/start', wrap(async (req, res) => {
  const confirmedMatch = await one(
    `SELECT m.id FROM match_participant mp JOIN meal_match m ON m.id = mp.match_id
      WHERE mp.user_id = :u AND m.status IN ('CONFIRMED','SCHEDULED')`, { u: req.user.id });
  if (confirmedMatch) {
    return res.status(409).json({ message: '이미 확정된 매칭이 있어요. 매칭 관리에서 확인해보세요.' });
  }
  const active = await one("SELECT id FROM matching_request WHERE active_user_id = :u", { u: req.user.id });
  if (active) return res.status(409).json({ message: '이미 진행 중인 매칭이 있습니다.', id: active.id });

  const [ins] = await pool.execute(
    `INSERT INTO matching_request
       (user_id, matching_type, food_type_code, talk_style_code, meal_time_code, price_min, price_max, status, started_at)
     VALUES (:u, 'BLIND', 'ANY', 'EASY', :mt, 0, 100000, 'SEARCHING', NOW())`,
    { u: req.user.id, mt: currentMealTimeCode() });
  const myRequestId = ins.insertId;

  const partner = await one(
    `SELECT id, user_id FROM matching_request
      WHERE matching_type = 'BLIND' AND status = 'SEARCHING' AND user_id <> :u
      ORDER BY started_at ASC LIMIT 1`,
    { u: req.user.id });

  if (!partner) return res.status(201).json({ matched: false, requestId: myRequestId });

  const conn = await pool.getConnection();
  try {
    const [propIns] = await conn.execute(
      `INSERT INTO match_proposal
         (requester_request_id, requester_user_id, receiver_user_id, receiver_request_id, expires_at)
       VALUES (:rq, :ru, :cu, :cr, DATE_ADD(NOW(), INTERVAL 30 MINUTE))`,
      { rq: partner.id, ru: partner.user_id, cu: req.user.id, cr: myRequestId });
    await conn.query('CALL sp_accept_proposal(?, @mid)', [propIns.insertId]);
    const [[out]] = await conn.query('SELECT @mid AS matchId');

    // 먼저 기다리던 상대는 폴링 없이도 바로 알 수 있게 실시간으로 알린다(대기 화면이 폴링도 겸함).
    req.app.get('io')?.to(`user:${partner.user_id}`).emit('blind:matched', { matchId: out.matchId });
    res.status(201).json({ matched: true, matchId: out.matchId });
  } finally {
    conn.release();
  }
}));

/** 매칭 시작하기 → SEARCHING (트리거가 상태 이력까지 기록) */
r.post('/:id/start', wrap(async (req, res) => {
  await q(`UPDATE matching_request SET status='SEARCHING', started_at=NOW()
            WHERE id=:id AND user_id=:u AND status='DRAFT'`,
    { id: req.params.id, u: req.user.id });
  res.json({ ok: true, status: 'SEARCHING' });
}));

/** 매칭 진행 페이지 — 상태 폴링 */
r.get('/current', wrap(async (req, res) => {
  const mr = await one(
    `SELECT mr.*, ft.label AS food_type, ts.label AS talk_style, mt.label AS meal_time,
            vr.name AS restaurant_name, vr.recruiting_count AS restaurant_recruiting_count,
            vs.label AS spot_label, vs.recruiting_count AS spot_recruiting_count
       FROM matching_request mr
       JOIN food_type_code ft ON ft.code=mr.food_type_code
       JOIN talk_style_code ts ON ts.code=mr.talk_style_code
       JOIN meal_time_code mt ON mt.code=mr.meal_time_code
       LEFT JOIN v_restaurant_recruiting vr ON vr.restaurant_id = mr.restaurant_id
       LEFT JOIN v_spot_recruiting vs        ON vs.spot_id       = mr.spot_id
      WHERE mr.active_user_id = :u`, { u: req.user.id });
  if (!mr) return res.json(null);
  const history = await q(
    `SELECT from_status, to_status, changed_at FROM matching_status_history
      WHERE matching_request_id=:id ORDER BY changed_at`, { id: mr.id });
  res.json({ ...mr, history });
}));

/**
 * 매칭 결과 페이지 — 후보 목록.
 * ?relax=1 이면 시간대·음식·가격 조건을 풀어 넓게 찾는다("조건 넓혀서 찾기").
 */
r.get('/:id/candidates', wrap(async (req, res) => {
  const rows = await findCandidates(Number(req.params.id), req.user.id, {
    limit: Number(req.query.limit || 10),
    relax: req.query.relax === '1' || req.query.relax === 'true',
  });
  res.json(rows);
}));

/**
 * 왜 후보가 안 잡히는지 진단.
 * 무한 스피너 대신 "시간대가 안 맞아요" 처럼 원인을 보여주기 위한 것.
 */
r.get('/:id/diagnosis', wrap(async (req, res) => {
  const id = Number(req.params.id);
  const mine = await one(
    `SELECT mr.*, mt.sort_order AS meal_order FROM matching_request mr
       JOIN meal_time_code mt ON mt.code = mr.meal_time_code
      WHERE mr.id = :id AND mr.user_id = :me`, { id, me: req.user.id });
  if (!mine) return res.status(404).json({ message: '매칭 요청을 찾을 수 없습니다.' });

  const MEAL_OK  = 'ABS(mt.sort_order - :mealOrder) <= 1';
  const FOOD_OK  = "(o.food_type_code = :food OR 'ANY' IN (o.food_type_code, :food))";
  const PRICE_OK = '(o.price_max >= :pmin AND o.price_min <= :pmax)';

  const [row] = await q(
    `SELECT
       COUNT(*) AS searching,
       SUM(${MEAL_OK})  AS meal_ok,
       SUM(${FOOD_OK})  AS food_ok,
       SUM(${PRICE_OK}) AS price_ok,
       SUM(${MEAL_OK} AND ${FOOD_OK} AND ${PRICE_OK}) AS all_ok
     FROM matching_request o
     JOIN users u           ON u.id = o.user_id AND u.status = 'ACTIVE'
     JOIN meal_time_code mt ON mt.code = o.meal_time_code
    WHERE o.status = 'SEARCHING' AND o.user_id <> :me AND o.matching_type <> 'BLIND'`,
    { me: req.user.id, mealOrder: mine.meal_order, food: mine.food_type_code,
      pmin: mine.price_min, pmax: mine.price_max });

  const n = (v) => Number(v || 0);
  const searching = n(row.searching);
  const reasons = [];

  if (!searching) {
    reasons.push('지금 매칭 중인 다른 사람이 없어요.');
  } else {
    if (!n(row.meal_ok))  reasons.push('시간대가 맞는 사람이 없어요.');
    if (!n(row.food_ok))  reasons.push('음식 종류가 맞는 사람이 없어요.');
    if (!n(row.price_ok)) reasons.push('가격대가 맞는 사람이 없어요.');
    // 조건별로는 맞는 사람이 있는데 셋을 동시에 만족하는 사람이 없는 경우.
    // 이걸 빼면 "왜 안 잡히지" 상태에서 아무 설명도 못 준다.
    if (!reasons.length && !n(row.all_ok)) {
      reasons.push('조건을 모두 만족하는 사람이 없어요. 조건을 넓혀서 찾아보세요.');
    }
  }

  res.json({
    searching,
    matched: n(row.all_ok),
    reasons,
  });
}));

/** 뒤로가기/취소 */
r.post('/:id/cancel', wrap(async (req, res) => {
  await q(`UPDATE matching_request SET status='CANCELLED', ended_at=NOW()
            WHERE id=:id AND user_id=:u AND status IN ('DRAFT','SEARCHING')`,
    { id: req.params.id, u: req.user.id });
  res.json({ ok: true });
}));

/** 홈 화면 — 확정 매칭 정보 + 지금 매칭 찾는 인원 + 이번 주 인기 음식(가벼운 사회적 증거용) */
r.get('/home', wrap(async (req, res) => {
  const confirmed = await one(
    'SELECT * FROM v_home_confirmed_match WHERE user_id = :u ORDER BY match_id DESC LIMIT 1',
    { u: req.user.id });
  const inboxNew = await one(
    "SELECT COUNT(*) AS c FROM v_inbox WHERE user_id=:u AND status='PENDING' AND is_new", { u: req.user.id });
  // 하단 바 채팅 탭 배지 — 방마다 안 읽은 메시지 수(v_chat_list.unread_count)를 다 더한다.
  const chatUnread = await one(
    `SELECT COALESCE(SUM(unread_count), 0) AS c FROM v_chat_list
      WHERE user_id = :u AND match_id NOT IN (SELECT match_id FROM chat_room_hidden WHERE user_id = :u)`,
    { u: req.user.id });
  const searching = await one(
    "SELECT COUNT(*) AS c FROM matching_request WHERE status='SEARCHING' AND user_id <> :u", { u: req.user.id });

  // 이번 주(최근 7일) 매칭 요청 중 가장 많이 고른 음식 종류. 'ANY'(아무거나)는 통계에서 뺀다 —
  // 취향을 알려주는 신호가 아니라서.
  const popularFood = await one(
    `SELECT ft.label, COUNT(*) AS cnt,
            ROUND(COUNT(*) * 100.0 / (
              SELECT COUNT(*) FROM matching_request
               WHERE created_at >= DATE_SUB(NOW(), INTERVAL 7 DAY) AND food_type_code <> 'ANY'
            )) AS pct
       FROM matching_request mr
       JOIN food_type_code ft ON ft.code = mr.food_type_code
      WHERE mr.created_at >= DATE_SUB(NOW(), INTERVAL 7 DAY) AND mr.food_type_code <> 'ANY'
      GROUP BY ft.code, ft.label
      ORDER BY cnt DESC
      LIMIT 1`);

  res.json({
    confirmedMatch: confirmed, inboxNewCount: inboxNew.c, chatUnreadCount: chatUnread.c,
    searchingCount: searching.c,
    popularFood: popularFood ? { label: popularFood.label, pct: popularFood.pct } : null,
  });
}));

export default r;
