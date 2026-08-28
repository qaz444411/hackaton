/**
 * .sql 파일 실행기 — mysql CLI 가 없는 환경용.
 *
 *   node scripts/run-sql.js ../db/03_schema_patch_v3.sql
 *
 * mysql CLI 전용 문법인 DELIMITER 를 해석해서, 트리거/프로시저처럼
 * 본문에 세미콜론이 들어있는 블록도 한 덩어리로 서버에 보낸다.
 * (DELIMITER 는 클라이언트 측 문법이라 드라이버로는 그냥 통째로 보내면 된다)
 */
import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import mysql from 'mysql2/promise';

/** DELIMITER 를 고려해 SQL 을 실행 단위로 쪼갠다 */
export function splitSql(sql) {
  const out = [];
  let delim = ';';
  let buf = '';

  // 줄 단위로 훑으면서 DELIMITER 지시문을 만나면 구분자를 바꾼다
  for (const rawLine of sql.split(/\r?\n/)) {
    const line = rawLine.trimEnd();
    const m = /^\s*DELIMITER\s+(\S+)\s*$/i.exec(line);
    if (m) {
      if (buf.trim()) { out.push(buf.trim()); buf = ''; }
      delim = m[1];
      continue;
    }
    buf += rawLine + '\n';

    // 현재 구분자로 끝나면 한 문장 완성
    const t = buf.trimEnd();
    if (t.endsWith(delim)) {
      const stmt = t.slice(0, -delim.length).trim();
      if (stmt) out.push(stmt);
      buf = '';
    }
  }
  if (buf.trim()) out.push(buf.trim());

  // 주석/빈 줄만 있는 조각은 버린다
  return out.filter((s) => s.split(/\r?\n/).some((l) => l.trim() && !l.trim().startsWith('--')));
}

async function main() {
  const file = process.argv[2];
  if (!file) {
    console.error('사용법: node scripts/run-sql.js <파일.sql>');
    process.exit(1);
  }
  const abs = path.resolve(process.cwd(), file);
  const sql = fs.readFileSync(abs, 'utf8');
  const statements = splitSql(sql);

  const conn = await mysql.createConnection({
    host: process.env.DB_HOST, port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER, password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME, multipleStatements: false, charset: 'utf8mb4',
  });

  console.log(`${path.basename(abs)} — 문장 ${statements.length}개 실행`);
  let n = 0;
  try {
    for (const stmt of statements) {
      const label = stmt.replace(/\s+/g, ' ').slice(0, 70);
      try {
        await conn.query(stmt);
        console.log(`  ok   [${++n}/${statements.length}] ${label}`);
      } catch (e) {
        console.error(`  FAIL [${n + 1}/${statements.length}] ${label}`);
        console.error(`       ${e.code}: ${e.sqlMessage || e.message}`);
        throw e;
      }
    }
    console.log('완료');
  } finally {
    await conn.end();
  }
}

main().catch((e) => {
  // 오류를 삼키면 "아무 것도 안 찍히고 실패"가 되어 원인을 못 찾는다.
  console.error("실행 실패: " + e.message);
  process.exit(1);
});
