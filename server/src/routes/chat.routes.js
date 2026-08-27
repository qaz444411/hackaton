import { Router } from 'express';
import { z } from 'zod';
import { q, one, pool } from '../db/pool.js';
import { auth } from '../middlewares/auth.js';
import { wrap } from '../middlewares/error.js';
import { suggestQuestions } from '../services/gemini.service.js';

const r = Router();
r.use(auth);

/** 채팅 목록 페이지 */
r.get('/rooms', wrap(async (req, res) => {
  const rows = await q(
    'SELECT * FROM v_chat_list WHERE user_id = :u ORDER BY COALESCE(last_message_at, "1970-01-01") DESC',
    { u: req.user.id });
  res.json(rows);
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
  const [ins] = await pool.execute(
    `INSERT INTO chat_message (match_id, sender_id, message_type, content)
     VALUES (:m, :u, 'TEXT', :c)`,
    { m: req.params.matchId, u: req.user.id, c: b.content });
  res.status(201).json(await one('SELECT * FROM chat_message WHERE id = :id', { id: ins.insertId }));
}));

/**
 * 대화 주제 추천 — 제미나이 챗봇 API 가 들어가는 자리.
 * 두 사람의 공통 관심사·MBTI·음식점을 프롬프트로 넘겨 질문 3개를 받는다.
 * '다른 질문 보기' 는 refresh=1 로 재호출.
 */
r.get('/rooms/:matchId/suggestions', wrap(async (req, res) => {
  const matchId = Number(req.params.matchId);
  const guard = await one('SELECT 1 AS ok FROM match_participant WHERE match_id=:m AND user_id=:u',
    { m: matchId, u: req.user.id });
  if (!guard) return res.status(403).json({ message: '참여자가 아닙니다.' });

  if (!req.query.refresh) {
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

/** 신고하고 나가기 / 강제 종료 */
r.post('/rooms/:matchId/report', wrap(async (req, res) => {
  const b = z.object({ reasonCode: z.string(), detail: z.string().max(300).optional() }).parse(req.body);
  const partner = await one(
    'SELECT user_id FROM match_participant WHERE match_id=:m AND user_id<>:u', { m: req.params.matchId, u: req.user.id });
  await q(`INSERT INTO user_report (match_id, reporter_id, reported_id, reason_code, detail)
           VALUES (:m, :u, :p, :r, :d)`,
    { m: req.params.matchId, u: req.user.id, p: partner.user_id, r: b.reasonCode, d: b.detail ?? null });
  await q(`UPDATE meal_match SET status='CANCELLED', cancelled_at=NOW(), cancelled_by=:u WHERE id=:m`,
    { u: req.user.id, m: req.params.matchId });   // 트리거가 채팅방을 READ_ONLY 로 전환
  res.json({ ok: true });
}));

r.post('/rooms/:matchId/close', wrap(async (req, res) => {
  await q(`UPDATE meal_match SET status='CANCELLED', cancelled_at=NOW(), cancelled_by=:u WHERE id=:m`,
    { u: req.user.id, m: req.params.matchId });
  res.json({ ok: true });
}));

export default r;
