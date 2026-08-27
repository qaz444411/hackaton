import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { q, one } from '../db/pool.js';
import { sign, auth } from '../middlewares/auth.js';
import { wrap } from '../middlewares/error.js';

const r = Router();
const PW = /^(?=.*[A-Za-z])(?=.*\d)(?=.*[^A-Za-z0-9]).{8,}$/;   // 영문+숫자+특수문자 8자 이상

/** 닉네임 / 이메일 중복확인 — 회원가입 페이지 "중복체크" 버튼 */
r.get('/check', wrap(async (req, res) => {
  const { field, value } = req.query;
  if (!['nickname', 'email'].includes(field)) return res.status(400).json({ message: 'field 오류' });
  const row = await one(`SELECT id FROM users WHERE ${field} = :v`, { v: value });
  res.json({ available: !row });
}));

/** 1단계 회원가입 (회원가입 페이지) → signup_step='PROFILE' */
r.post('/signup', wrap(async (req, res) => {
  const body = z.object({
    email: z.string().email(),
    password: z.string().regex(PW, '영문·숫자·특수문자 포함 8자 이상'),
    nickname: z.string().min(2).max(10),
    age: z.number().int().min(14).max(100),
    gender: z.enum(['MALE', 'FEMALE']),
    regionCode: z.string(),
  }).parse(req.body);

  const hash = await bcrypt.hash(body.password, 10);
  const [result] = await (await import('../db/pool.js')).pool.execute(
    `INSERT INTO users (login_id, email, password_hash, nickname, age, gender, region_code, signup_step)
     VALUES (:email, :email, :hash, :nickname, :age, :gender, :region, 'PROFILE')`,
    { email: body.email, hash, nickname: body.nickname, age: body.age, gender: body.gender, region: body.regionCode },
  );
  const user = await one('SELECT id, nickname FROM users WHERE id = :id', { id: result.insertId });
  res.status(201).json({ token: sign(user), user, nextStep: 'PROFILE' });
}));

/** 로그인 — 이메일 또는 닉네임 */
r.post('/login', wrap(async (req, res) => {
  const { account, password } = req.body;
  const user = await one(
    `SELECT id, nickname, password_hash, status, signup_step
       FROM users WHERE email = :a OR nickname = :a`, { a: account });
  if (!user || !(await bcrypt.compare(password, user.password_hash)))
    return res.status(401).json({ message: '계정 정보가 올바르지 않습니다.' });
  if (user.status !== 'ACTIVE') return res.status(403).json({ message: '이용이 제한된 계정입니다.' });
  res.json({
    token: sign(user),
    user: { id: user.id, nickname: user.nickname },
    nextStep: user.signup_step,
  });
}));

r.get('/me', auth, wrap(async (req, res) => {
  const me = await one(
    `SELECT u.id, u.nickname, u.email, u.age, u.gender, u.region_code, u.profile_image, u.signup_step,
            p.mbti_code, p.has_allergy, p.spicy_level, p.oily_level
       FROM users u LEFT JOIN user_profile p ON p.user_id = u.id
      WHERE u.id = :id`, { id: req.user.id });
  const interests = await q(
    `SELECT i.id, i.name FROM user_interest ui JOIN interest i ON i.id = ui.interest_id
      WHERE ui.user_id = :id ORDER BY ui.slot`, { id: req.user.id });
  res.json({ ...me, interests });
}));

export default r;
