import { Router } from 'express';
import { z } from 'zod';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import multer from 'multer';
import { q, one, tx } from '../db/pool.js';
import { auth } from '../middlewares/auth.js';
import { wrap } from '../middlewares/error.js';

const r = Router();
r.use(auth);

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const avatarDir = path.join(__dirname, '..', '..', 'uploads', 'avatars');
fs.mkdirSync(avatarDir, { recursive: true });

const avatarUpload = multer({
  storage: multer.diskStorage({
    destination: avatarDir,
    filename: (req, file, cb) => {
      const ext = path.extname(file.originalname).toLowerCase() || '.jpg';
      cb(null, `u${req.user.id}-${Date.now()}${ext}`);
    },
  }),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    cb(null, /^image\/(jpeg|png|webp|gif)$/.test(file.mimetype));
  },
});

/** 기본선택페이지 저장 (MBTI/알레르기/맵기/느끼함/관심사 최대 3개) → 회원가입 완료 */
r.post('/profile', wrap(async (req, res) => {
  const b = z.object({
    mbtiCode: z.string().length(4),
    hasAllergy: z.boolean(),
    spicyLevel: z.number().int().min(1).max(3),
    oilyLevel: z.number().int().min(1).max(3),
    interestIds: z.array(z.number().int()).max(3),
  }).parse(req.body);

  await tx(async (c) => {
    await c.execute(
      `INSERT INTO user_profile (user_id, mbti_code, has_allergy, spicy_level, oily_level)
       VALUES (:u, :m, :a, :s, :o)
       ON DUPLICATE KEY UPDATE mbti_code=:m, has_allergy=:a, spicy_level=:s, oily_level=:o`,
      { u: req.user.id, m: b.mbtiCode, a: b.hasAllergy, s: b.spicyLevel, o: b.oilyLevel });
    await c.execute('DELETE FROM user_interest WHERE user_id = :u', { u: req.user.id });
    let slot = 1;
    for (const id of b.interestIds) {
      await c.execute(
        'INSERT INTO user_interest (user_id, slot, interest_id) VALUES (:u, :s, :i)',
        { u: req.user.id, s: slot++, i: id });
    }
    await c.execute("UPDATE users SET signup_step='DONE' WHERE id = :u", { u: req.user.id });
  });
  res.json({ ok: true, nextStep: 'DONE' });
}));

/** 프로필 사진 업로드 — 마이페이지 아바타 연필 버튼 */
r.post('/me/avatar', avatarUpload.single('avatar'), wrap(async (req, res) => {
  if (!req.file) return res.status(400).json({ message: '이미지 파일이 필요합니다.' });

  const prev = await one('SELECT profile_image FROM users WHERE id = :u', { u: req.user.id });
  const url = `/api/uploads/avatars/${req.file.filename}`;
  await q('UPDATE users SET profile_image = :url WHERE id = :u', { url, u: req.user.id });

  // 이전 파일이 우리가 올린 것이면 정리한다(외부 URL 이었을 수도 있으니 경로 확인)
  if (prev?.profile_image?.startsWith('/api/uploads/avatars/')) {
    const oldPath = path.join(avatarDir, path.basename(prev.profile_image));
    fs.unlink(oldPath, () => {});
  }

  res.json({ profileImage: url });
}));

/** 마이페이지 — 프로필 + 이용 현황(함께한 밥 / 만난 밥친구) + 알림 설정 */
r.get('/me/mypage', wrap(async (req, res) => {
  const [profile, stats, notify] = await Promise.all([
    one(`SELECT u.id, u.nickname, u.age, u.gender, u.profile_image, u.region_code,
                p.mbti_code, p.has_allergy, p.spicy_level, p.oily_level
           FROM users u LEFT JOIN user_profile p ON p.user_id = u.id WHERE u.id = :id`, { id: req.user.id }),
    one('SELECT meal_count, buddy_count FROM v_user_stats WHERE user_id = :id', { id: req.user.id }),
    one('SELECT match_push, chat_push, marketing, ai_context_enabled FROM user_notification_setting WHERE user_id = :id', { id: req.user.id }),
  ]);
  const interests = await q(
    `SELECT i.id, i.name FROM user_interest ui JOIN interest i ON i.id = ui.interest_id
      WHERE ui.user_id = :id ORDER BY ui.slot`, { id: req.user.id });
  res.json({ profile: { ...profile, interests }, stats, notify });
}));

/** 알림 설정 변경 */
r.patch('/me/notifications', wrap(async (req, res) => {
  const b = z.object({
    matchPush: z.boolean(), chatPush: z.boolean(), marketing: z.boolean(),
  }).parse(req.body);
  await q(`UPDATE user_notification_setting
              SET match_push=:m, chat_push=:c, marketing=:k WHERE user_id=:u`,
    { m: b.matchPush, c: b.chatPush, k: b.marketing, u: req.user.id });
  res.json({ ok: true });
}));

/**
 * 채팅방 AI 추천 질문이 최근 대화를 참고하게 할지 — 기본 OFF.
 * 켜면 상대방 메시지도 함께 제미나이/Bedrock 으로 나가므로 마이페이지와
 * 채팅방 두 군데서 같은 값을 보고 바꿀 수 있게 별도 엔드포인트로 뺐다.
 */
r.get('/me/ai-context', wrap(async (req, res) => {
  const row = await one(
    'SELECT ai_context_enabled AS enabled FROM user_notification_setting WHERE user_id = :u', { u: req.user.id });
  res.json({ enabled: !!row?.enabled });
}));

r.patch('/me/ai-context', wrap(async (req, res) => {
  const b = z.object({ enabled: z.boolean() }).parse(req.body);
  await q('UPDATE user_notification_setting SET ai_context_enabled=:e WHERE user_id=:u',
    { e: b.enabled, u: req.user.id });
  res.json({ ok: true, enabled: b.enabled });
}));

/** 매칭 기록 */
r.get('/me/history', wrap(async (req, res) => {
  const rows = await q(
    `SELECT m.id AS match_id, m.status, m.meal_date, m.confirmed_at,
            ft.label AS food_type, mt.label AS meal_time, r.name AS restaurant_name,
            ou.nickname AS partner_nickname, ou.profile_image AS partner_image
       FROM match_participant me
       JOIN meal_match m            ON m.id = me.match_id
       JOIN match_participant other ON other.match_id = m.id AND other.user_id <> me.user_id
       JOIN users ou                ON ou.id = other.user_id
       JOIN food_type_code ft       ON ft.code = m.food_type_code
       JOIN meal_time_code mt       ON mt.code = m.meal_time_code
       LEFT JOIN restaurant r       ON r.id = m.restaurant_id
      WHERE me.user_id = :u
      ORDER BY m.confirmed_at DESC`, { u: req.user.id });
  res.json(rows);
}));

/** 상대 프로필 상세 (매칭 결과 페이지) — 취향 일치율 포함 */
r.get('/:id/profile', wrap(async (req, res) => {
  const target = Number(req.params.id);
  const p = await one(
    `SELECT u.id, u.nickname, u.age, u.gender, u.profile_image,
            p.mbti_code, p.has_allergy, p.spicy_level, p.oily_level
       FROM users u JOIN user_profile p ON p.user_id = u.id WHERE u.id = :id`, { id: target });
  if (!p) return res.status(404).json({ message: '사용자를 찾을 수 없습니다.' });
  const interests = await q(
    `SELECT i.name FROM user_interest ui JOIN interest i ON i.id = ui.interest_id
      WHERE ui.user_id = :id ORDER BY ui.slot`, { id: target });
  const cond = await one(
    `SELECT ft.label AS food_type, ts.label AS talk_style, mt.label AS meal_time, mr.price_min, mr.price_max
       FROM matching_request mr
       JOIN food_type_code ft ON ft.code = mr.food_type_code
       JOIN talk_style_code ts ON ts.code = mr.talk_style_code
       JOIN meal_time_code mt ON mt.code = mr.meal_time_code
      WHERE mr.user_id = :id AND mr.status IN ('DRAFT','SEARCHING') LIMIT 1`, { id: target });
  const rate = await one('SELECT fn_taste_match_rate(:a, :b) AS rate', { a: req.user.id, b: target });
  res.json({ ...p, interests: interests.map((i) => i.name), condition: cond, matchRate: rate.rate });
}));

export default r;
