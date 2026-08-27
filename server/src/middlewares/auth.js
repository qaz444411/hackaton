import jwt from 'jsonwebtoken';
import { config } from '../config.js';

export function sign(user) {
  return jwt.sign({ id: user.id, nickname: user.nickname }, config.jwt.secret, {
    expiresIn: config.jwt.expiresIn,
  });
}

export function auth(req, res, next) {
  const h = req.headers.authorization || '';
  const token = h.startsWith('Bearer ') ? h.slice(7) : null;
  if (!token) return res.status(401).json({ message: '로그인이 필요합니다.' });
  try {
    req.user = jwt.verify(token, config.jwt.secret);
    next();
  } catch {
    res.status(401).json({ message: '세션이 만료되었습니다.' });
  }
}
