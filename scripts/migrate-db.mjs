// Copy every row from one Neon database to another.
//
// Written for the move off the Vercel-managed free org onto the paid one.
// The schema is created by drizzle-kit on the target first; this only moves
// data. There are no foreign keys in this schema (a deliberate convention),
// so table order does not matter, but users and leagues go first anyway so a
// half-finished run leaves something coherent.
//
//   node scripts/migrate-db.mjs "<source-url>" "<target-url>"
//
// Idempotent: every table is truncated on the target before it is filled, so
// a failed run can simply be repeated.
import { neon } from '@neondatabase/serverless';

const [sourceUrl, targetUrl] = process.argv.slice(2);
if (!sourceUrl || !targetUrl) {
  console.error('usage: node scripts/migrate-db.mjs "<source-url>" "<target-url>"');
  process.exit(1);
}

const src = neon(sourceUrl);
const dst = neon(targetUrl);

// Identity and league structure first, then everything derived from it.
const TABLES = [
  'users',
  'leagues',
  'league_members',
  'squads',
  'squad_players',
  'draft_picks',
  'draft_queues',
  'lineups',
  'gw_scores',
  'season_scores',
  'standing_snapshots',
  'matchups',
  'h2h_records',
  'chips',
  'gw_awards',
  'waiver_priority',
  'waiver_claims',
  'waiver_locks',
  'trades',
  'push_subscriptions',
  'login_attempts',
  'sync_meta',
  'gameweeks',
  'fixtures',
  'fpl_players',
  'gw_player_points',
];

const CHUNK = 500;

async function columnsOf(table) {
  const r = await src.query(
    `select column_name from information_schema.columns
      where table_schema = 'public' and table_name = $1
      order by ordinal_position`,
    [table],
  );
  return (r.rows ?? r).map((c) => c.column_name);
}

async function tableExists(table) {
  const r = await src.query(
    `select 1 from information_schema.tables
      where table_schema = 'public' and table_name = $1`,
    [table],
  );
  return (r.rows ?? r).length > 0;
}

let moved = 0;
for (const table of TABLES) {
  if (!(await tableExists(table))) {
    console.log(`- ${table}: not in source, skipped`);
    continue;
  }
  const cols = await columnsOf(table);
  const rowsRes = await src.query(`select * from "${table}"`);
  const rows = rowsRes.rows ?? rowsRes;

  await dst.query(`truncate table "${table}"`);
  if (!rows.length) {
    console.log(`- ${table}: empty`);
    continue;
  }

  const quoted = cols.map((c) => `"${c}"`).join(', ');
  for (let i = 0; i < rows.length; i += CHUNK) {
    const slice = rows.slice(i, i + CHUNK);
    const values = [];
    const params = [];
    let n = 1;
    for (const row of slice) {
      values.push(`(${cols.map(() => `$${n++}`).join(', ')})`);
      for (const c of cols) {
        const v = row[c];
        // jsonb comes back as an object and has to go in as text.
        params.push(v !== null && typeof v === 'object' && !(v instanceof Date) ? JSON.stringify(v) : v);
      }
    }
    await dst.query(`insert into "${table}" (${quoted}) values ${values.join(', ')}`, params);
  }
  moved += rows.length;
  console.log(`- ${table}: ${rows.length} rows`);
}

console.log(`\ndone: ${moved} rows moved`);

// Prove it landed: the league is the part that cannot be regenerated.
const check = await dst.query(
  `select (select count(*) from users) as users,
          (select count(*) from leagues) as leagues,
          (select count(*) from draft_picks) as picks,
          (select count(*) from squad_players where dropped_gw is null) as owned,
          (select count(*) from lineups) as lineups`,
);
console.log('target now holds:', JSON.stringify((check.rows ?? check)[0]));
