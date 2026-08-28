/**
 * db/*.sql 패치 적용 상태를 한 번에 점검한다.
 *
 *   npm run db:status
 *
 * 왜 필요한가
 *   자동 배포(GitHub Actions)는 코드만 갱신한다. db/*.sql 은
 *   docker-entrypoint-initdb.d 로 "최초 1회, 데이터가 없을 때만" 실행되므로,
 *   이미 운영 중인 DB 에는 새 패치가 자동으로 반영되지 않는다.
 *   실제로 v5 가 누락된 채 코드만 배포돼 채팅 목록이 500 을 뱉은 적이 있다.
 *
 * 각 패치가 "무엇을 만들었는가"를 실측해서 판정한다.
 * 버전 기록 테이블에 의존하지 않으므로, 손으로 적용했든 initdb 로 들어갔든
 * 똑같이 잡아낸다.
 *
 * 종료 코드 : 0 = 전부 적용됨 / 1 = 빠진 패치 있음 (CI 에서 쓸 수 있게)
 */
import 'dotenv/config';
import { pool } from '../src/db/pool.js';

/** 패치별 판정 근거. 하나라도 없으면 미적용으로 본다. */
const MIGRATIONS = [
  {
    file: '01_schema_v1.sql', label: 'v1 기본 스키마',
    checks: [
      ['table', 'users'], ['table', 'restaurant'], ['table', 'match_proposal'],
      ['table', 'meal_match'], ['routine', 'sp_accept_proposal'],
    ],
  },
  {
    file: '02_schema_patch_v2.sql', label: 'v2 요구사항 반영',
    checks: [
      ['table', 'region_code'], ['table', 'chat_suggested_question'],
      ['table', 'user_report'], ['table', 'user_notification_setting'],
      ['view', 'v_restaurant_recruiting'], ['view', 'v_inbox'],
      ['routine', 'fn_taste_match_rate'],
      ['column', 'restaurant', 'category_name'],
    ],
  },
  {
    file: '03_schema_patch_v3.sql', label: 'v3 지도 마커(map_spot)',
    checks: [
      ['table', 'map_spot'],
      ['column', 'matching_request', 'spot_id'],
      ['column', 'meal_match', 'spot_id'],
      ['view', 'v_spot_recruiting'], ['view', 'v_spot_buddy'],
    ],
  },
  {
    file: '04_schema_patch_v4.sql', label: 'v4 추천질문 출처에 BEDROCK 허용',
    checks: [['check_contains', 'ck_csq_source', 'BEDROCK']],
  },
  {
    file: '05_schema_patch_v5.sql', label: 'v5 채팅 개선(숨김·AI 문맥 동의)',
    checks: [
      ['table', 'chat_room_hidden'],
      ['column', 'user_notification_setting', 'ai_context_enabled'],
    ],
  },
  {
    file: '06_schema_patch_v6.sql', label: 'v6 지도 핀 카테고리 아이콘',
    checks: [['column', 'v_restaurant_recruiting', 'category_name']],
  },
  {
    file: '07_schema_patch_v7.sql', label: 'v7 음식 종류 기타(ETC) 추가',
    checks: [['row', 'food_type_code', "code = 'ETC'"]],
  },
  {
    file: '08_schema_patch_v8.sql', label: 'v8 채팅 메시지에 RESTAURANT(식당 카드) 타입 추가',
    checks: [['check_contains', 'ck_chat_message_type', 'RESTAURANT']],
  },
  {
    file: '09_schema_patch_v9.sql', label: 'v9 밥친구 평가(match_rating) 테이블 추가',
    checks: [['table', 'match_rating']],
  },
  {
    file: '10_schema_patch_v10.sql', label: 'v10 보관함 알림 삭제(proposal_hidden) 테이블 추가',
    checks: [['table', 'proposal_hidden']],
  },
  {
    file: '11_schema_patch_v11.sql', label: 'v11 지역 선택지 확대(광주 등 추가)',
    checks: [['row', 'region_code', "code = 'GWANGJU'"]],
  },
  {
    file: '12_schema_patch_v12.sql', label: 'v12 진짜 랜덤 매칭(BLIND) 타입 추가',
    checks: [['check_contains', 'ck_mr_type', 'BLIND']],
  },
  {
    file: '13_schema_patch_v13.sql', label: 'v13 채팅 목록 미리보기에 last_message_type 추가',
    checks: [['column', 'v_chat_list', 'last_message_type']],
  },
  {
    file: '14_schema_patch_v14.sql', label: 'v14 잡은 약속 취소(SCHEDULED→CONFIRMED) 허용',
    checks: [['trigger_contains', 'trg_match_transition', "'CONFIRMED','COMPLETED','CANCELLED'"]],
  },
  {
    file: '15_schema_patch_v15.sql', label: 'v15 사용자당 확정 매칭 1건 제한 제거',
    checks: [['trigger_not_contains', 'trg_match_participant_ins', 'already has an active match']],
  },
  {
    file: '16_schema_patch_v16.sql', label: 'v16 음식점 사진(image_url) 추가',
    checks: [['column', 'restaurant', 'image_url'], ['column', 'v_restaurant_recruiting', 'image_url']],
  },
  {
    file: '17_schema_patch_v17.sql', label: 'v17 홈 확정 매칭 카드에 상대 프로필 사진 노출',
    checks: [['column', 'v_home_confirmed_match', 'partner_image']],
  },
  {
    file: '18_schema_patch_v18.sql', label: 'v18 채팅 랜덤 메뉴 복권(LOTTERY) 타입 추가',
    checks: [['check_contains', 'ck_chat_message_type', 'LOTTERY']],
  },
];

const one = async (sql, params = []) => {
  const [rows] = await pool.query(sql, params);
  return rows[0];
};

/** 판정 하나를 실측한다. 존재하면 true. */
async function probe(check) {
  const [kind, a, b] = check;
  switch (kind) {
    case 'table': {
      const r = await one(
        `SELECT COUNT(*) n FROM information_schema.TABLES
          WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND TABLE_TYPE = 'BASE TABLE'`, [a]);
      return { ok: r.n > 0, what: `테이블 ${a}` };
    }
    case 'view': {
      const r = await one(
        `SELECT COUNT(*) n FROM information_schema.VIEWS
          WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?`, [a]);
      return { ok: r.n > 0, what: `뷰 ${a}` };
    }
    case 'column': {
      // 뷰의 컬럼도 information_schema.COLUMNS 에 잡힌다
      const r = await one(
        `SELECT COUNT(*) n FROM information_schema.COLUMNS
          WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?`, [a, b]);
      return { ok: r.n > 0, what: `${a}.${b}` };
    }
    case 'routine': {
      const r = await one(
        `SELECT COUNT(*) n FROM information_schema.ROUTINES
          WHERE ROUTINE_SCHEMA = DATABASE() AND ROUTINE_NAME = ?`, [a]);
      return { ok: r.n > 0, what: `프로시저/함수 ${a}` };
    }
    case 'check_contains': {
      // CHECK 제약의 정의에 특정 값이 들어 있는지 (예: source IN (...,'BEDROCK'))
      const r = await one(
        `SELECT CHECK_CLAUSE c FROM information_schema.CHECK_CONSTRAINTS
          WHERE CONSTRAINT_SCHEMA = DATABASE() AND CONSTRAINT_NAME = ?`, [a]);
      return { ok: !!r && String(r.c).includes(b), what: `제약 ${a} 에 ${b}` };
    }
    case 'trigger_contains': {
      // 트리거 본문(ACTION_STATEMENT)에 특정 문구가 들어 있는지 — 트리거를 재정의한 패치용
      const r = await one(
        `SELECT ACTION_STATEMENT c FROM information_schema.TRIGGERS
          WHERE TRIGGER_SCHEMA = DATABASE() AND TRIGGER_NAME = ?`, [a]);
      return { ok: !!r && String(r.c).includes(b), what: `트리거 ${a} 에 ${b}` };
    }
    case 'trigger_not_contains': {
      // 반대로, 트리거 본문에서 특정 문구가 빠졌는지 — 제약을 없애는 패치용
      const r = await one(
        `SELECT ACTION_STATEMENT c FROM information_schema.TRIGGERS
          WHERE TRIGGER_SCHEMA = DATABASE() AND TRIGGER_NAME = ?`, [a]);
      return { ok: !!r && !String(r.c).includes(b), what: `트리거 ${a} 에서 ${b} 제거` };
    }
    case 'row': {
      // 코드 테이블에 특정 행이 들어갔는지 (예: food_type_code 에 ETC)
      // 조건은 패치 파일이 정하는 고정 문자열이며 사용자 입력이 아니다.
      const r = await one(`SELECT COUNT(*) n FROM \`${a}\` WHERE ${b}`);
      return { ok: r.n > 0, what: `${a} (${b})` };
    }
    default:
      return { ok: false, what: `알 수 없는 판정 ${kind}` };
  }
}

async function main() {
  const db = await one('SELECT DATABASE() d, VERSION() v');
  console.log(`\nDB: ${db.d} (MySQL ${db.v})\n`);

  const rows = [];
  const missing = [];

  for (const m of MIGRATIONS) {
    const results = await Promise.all(m.checks.map(probe));
    const failed = results.filter((r) => !r.ok);
    const applied = failed.length === 0;
    if (!applied) missing.push({ ...m, failed });

    rows.push({
      패치: m.file.replace('_schema', '').replace('.sql', ''),
      내용: m.label,
      적용: applied ? 'OK' : '빠짐',
      '판정 근거': applied
        ? `${results.length}개 전부 확인`
        : `없음: ${failed.map((f) => f.what).join(', ')}`,
    });
  }

  console.table(rows);

  if (missing.length === 0) {
    console.log(`v1~v${MIGRATIONS.length} 전부 적용됨.\n`);
    return 0;
  }

  console.log(`\n빠진 패치 ${missing.length}개. 아래를 순서대로 실행한다.\n`);
  for (const m of missing) {
    console.log(`  docker compose --env-file .env.production exec api \\`);
    console.log(`    node scripts/run-sql.js ../db/${m.file}`);
  }
  console.log('\n(운영 서버는 ~/bapfriend 에서 실행. 로컬이면 cd server 후');
  console.log(' node scripts/run-sql.js ../db/<파일>)\n');
  return 1;
}

const code = await main();
await pool.end();
process.exit(code);
