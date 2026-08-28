import { translateSignal } from '../lib/sqlMessage.js';

export function notFound(req, res) {
  res.status(404).json({ message: 'Not Found' });
}

export function errorHandler(err, req, res, _next) {
  // MySQL 트리거/CHECK 의 SIGNAL 45000 은 업무 규칙 위반 → 409 (영문 원문은 한국어로 옮겨서 노출)
  if (err.sqlState === '45000') return res.status(409).json({ message: translateSignal(err.sqlMessage) });
  if (err.code === 'ER_DUP_ENTRY') return res.status(409).json({ message: '이미 존재하는 값입니다.' });
  if (err.name === 'ZodError') return res.status(400).json({ message: '입력값이 올바르지 않습니다.', issues: err.issues });
  console.error(err);
  res.status(err.status || 500).json({ message: err.message || '서버 오류' });
}
export const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
