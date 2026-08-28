/**
 * 음식점 사진 등록 — 카카오 로컬 API가 사진을 안 줘서(평점처럼 항상 없음)
 * 직접 모은 사진을 이 스크립트로 하나씩 붙인다.
 *
 *   node scripts/set-restaurant-image.js <restaurant_id> <이미지 파일 경로>
 *   node scripts/set-restaurant-image.js --find <이름 일부>   # id를 모를 때 검색
 *
 * 이미지는 uploads/restaurants/ 로 복사되고, restaurant.image_url 이
 * /api/uploads/restaurants/<파일명> 으로 갱신된다(정적 서빙은 app.js 의
 * /api/uploads 라우트가 uploads/ 전체를 이미 커버한다).
 */
import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import mysql from 'mysql2/promise';

const restaurantDir = path.join(import.meta.dirname, '..', 'uploads', 'restaurants');

async function main() {
  const [a, b] = process.argv.slice(2);
  if (!a) {
    console.error('사용법: node scripts/set-restaurant-image.js <restaurant_id> <이미지 파일 경로>');
    console.error('     또는: node scripts/set-restaurant-image.js --find <이름 일부>');
    process.exit(1);
  }

  const pool = await mysql.createPool({
    host: process.env.DB_HOST, port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER, password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME, namedPlaceholders: true, charset: 'utf8mb4',
  });

  try {
    if (a === '--find') {
      const [rows] = await pool.query(
        'SELECT id, name, road_address, image_url FROM restaurant WHERE name LIKE CONCAT("%", :kw, "%") ORDER BY name',
        { kw: b || '' });
      console.table(rows);
      return;
    }

    const id = Number(a);
    const filePath = b;
    if (!id || !filePath) {
      console.error('사용법: node scripts/set-restaurant-image.js <restaurant_id> <이미지 파일 경로>');
      process.exit(1);
    }
    if (!fs.existsSync(filePath)) {
      console.error(`파일을 찾을 수 없어요: ${filePath}`);
      process.exit(1);
    }

    const [[row]] = await pool.query('SELECT id, name, image_url FROM restaurant WHERE id = :id', { id });
    if (!row) {
      console.error(`restaurant id ${id} 를 찾을 수 없어요.`);
      process.exit(1);
    }

    fs.mkdirSync(restaurantDir, { recursive: true });
    const ext = path.extname(filePath).toLowerCase() || '.jpg';
    const filename = `r${id}-${Date.now()}${ext}`;
    fs.copyFileSync(filePath, path.join(restaurantDir, filename));

    const url = `/api/uploads/restaurants/${filename}`;
    await pool.query('UPDATE restaurant SET image_url = :url WHERE id = :id', { url, id });

    // 이전 파일이 우리가 올린 것이면 정리한다
    if (row.image_url?.startsWith('/api/uploads/restaurants/')) {
      const oldPath = path.join(restaurantDir, path.basename(row.image_url));
      fs.unlink(oldPath, () => {});
    }

    console.log(`OK — ${row.name} (id ${id}) → ${url}`);
  } finally {
    await pool.end();
  }
}

main().catch((e) => {
  console.error('실행 실패: ' + e.message);
  process.exit(1);
});
