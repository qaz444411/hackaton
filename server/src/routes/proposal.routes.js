import { Router } from 'express';
import { z } from 'zod';
import { q, one, pool } from '../db/pool.js';
import { auth } from '../middlewares/auth.js';
import { wrap } from '../middlewares/error.js';

const r = Router();
r.use(auth);

/** 매칭 요청하기 (밥친구 목록 → 매칭 요청 페이지) */
r.post('/', wrap(async (req, res) => {
  const b = z.object({
    requesterRequestId: z.number().int(),
    receiverUserId: z.number().int(),
    expiresInMinutes: z.number().int().default(30),
  }).parse(req.body);

  const receiverReq = await one(
    'SELECT id FROM matching_request WHERE active_user_id = :u', { u: b.receiverUserId });

  const [ins] = await pool.execute(
    `INSERT INTO match_proposal
       (requester_request_id, requester_user_id, receiver_user_id, receiver_request_id, expires_at)
     VALUES (:rq, :ru, :cu, :cr, DATE_ADD(NOW(), INTERVAL :m MINUTE))`,
    { rq: b.requesterRequestId, ru: req.user.id, cu: b.receiverUserId,
      cr: receiverReq?.id ?? null, m: b.expiresInMinutes });

  // 보관함 실시간 배지 — 상대가 지금 앱을 켜놓고 있으면 폴링을 기다릴 필요 없이 바로 뜬다.
  req.app.get('io')?.to(`user:${b.receiverUserId}`).emit('inbox:new', {
    proposalId: ins.insertId, fromNickname: req.user.nickname,
  });

  res.status(201).json({ id: ins.insertId, status: 'PENDING' });
}));

/**
 * 내가 보낸(요청자) 대기 중인 요청 — 화면을 나갔다 와도 다시 확인할 수 있게.
 * uq_proposal_pending_per_request 로 매칭 요청 1건당 PENDING 은 최대 1개다.
 */
r.get('/sent', wrap(async (req, res) => {
  const rows = await q(
    `SELECT p.id, p.expires_at, p.created_at,
            u.nickname AS partner_nickname, u.profile_image AS partner_image
       FROM match_proposal p
       JOIN users u ON u.id = p.receiver_user_id
      WHERE p.requester_user_id = :u AND p.status = 'PENDING' AND p.expires_at > NOW()
      ORDER BY p.created_at DESC`,
    { u: req.user.id });
  res.json(rows);
}));

/** 매칭 요청 대기 페이지 — 상태 폴링 */
r.get('/:id', wrap(async (req, res) => {
  const p = await one(
    `SELECT p.id, p.status, p.created_at, p.expires_at,
            u.nickname AS partner_nickname, u.age AS partner_age, u.profile_image AS partner_image,
            r.name AS restaurant_name,
            (SELECT m.id FROM meal_match m WHERE m.proposal_id = p.id) AS match_id
       FROM match_proposal p
       JOIN users u ON u.id = IF(p.requester_user_id = :me, p.receiver_user_id, p.requester_user_id)
       JOIN matching_request mr ON mr.id = p.requester_request_id
       LEFT JOIN restaurant r ON r.id = mr.restaurant_id
      WHERE p.id = :id AND :me IN (p.requester_user_id, p.receiver_user_id)`,
    { id: req.params.id, me: req.user.id });
  if (!p) return res.status(404).json({ message: '요청을 찾을 수 없습니다.' });
  res.json(p);
}));

/** 보관함 목록 */
r.get('/', wrap(async (req, res) => {
  const rows = await q(
    'SELECT * FROM v_inbox WHERE user_id = :u ORDER BY created_at DESC', { u: req.user.id });
  res.json(rows);
}));

/** 보관함 항목 열람 → 읽음 처리 (신규 건수 뱃지 감소) */
r.post('/:id/read', wrap(async (req, res) => {
  await q('UPDATE match_proposal SET read_at = NOW() WHERE id=:id AND receiver_user_id=:u AND read_at IS NULL',
    { id: req.params.id, u: req.user.id });
  res.json({ ok: true });
}));

/**
 * 수락 = "같이 밥 먹기".
 * meal_match / match_participant 직접 INSERT 금지 → 반드시 sp_accept_proposal 호출.
 */
r.post('/:id/accept', wrap(async (req, res) => {
  const conn = await pool.getConnection();
  try {
    const [[own]] = await conn.query(
      'SELECT receiver_user_id FROM match_proposal WHERE id = ?', [req.params.id]);
    if (!own || own.receiver_user_id !== req.user.id)
      return res.status(403).json({ message: '수락 권한이 없습니다.' });
    await conn.query('CALL sp_accept_proposal(?, @mid)', [req.params.id]);
    const [[out]] = await conn.query('SELECT @mid AS matchId');
    res.json({ matchId: out.matchId });
  } finally { conn.release(); }
}));

/** 거절 / 요청 취소 */
r.post('/:id/decline', wrap(async (req, res) => {
  await q(`UPDATE match_proposal SET status='DECLINED', responded_at=NOW()
            WHERE id=:id AND receiver_user_id=:u AND status='PENDING'`,
    { id: req.params.id, u: req.user.id });
  res.json({ ok: true });
}));
r.post('/:id/cancel', wrap(async (req, res) => {
  await q(`UPDATE match_proposal SET status='CANCELLED'
            WHERE id=:id AND requester_user_id=:u AND status='PENDING'`,
    { id: req.params.id, u: req.user.id });
  res.json({ ok: true });
}));

export default r;
