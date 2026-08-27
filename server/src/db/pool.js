import mysql from 'mysql2/promise';
import { config } from '../config.js';

// 스키마가 DATETIME 기준이므로 세션 타임존을 +09:00 으로 통일한다.
export const pool = mysql.createPool({
  ...config.db,
  waitForConnections: true,
  connectionLimit: 10,
  charset: 'utf8mb4_0900_ai_ci',
  timezone: '+09:00',
  dateStrings: false,
  namedPlaceholders: true,
});

export async function q(sql, params = {}) {
  const [rows] = await pool.execute(sql, params);
  return rows;
}
export async function one(sql, params = {}) {
  const rows = await q(sql, params);
  return rows[0] ?? null;
}
/** 트랜잭션 헬퍼 */
export async function tx(fn) {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const result = await fn(conn);
    await conn.commit();
    return result;
  } catch (e) {
    await conn.rollback();
    throw e;
  } finally {
    conn.release();
  }
}
