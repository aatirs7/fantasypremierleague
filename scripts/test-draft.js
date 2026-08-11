// End-to-end draft rehearsal against a running dev server. Signs in as the
// admin, creates a bot test league, starts the draft, polls like the real
// client, picks when it is our turn (firing a deliberate duplicate double-tap
// race on the first pick), and verifies final squads: 15 players each,
// 2/5/5/3 quotas, no duplicate ownership. Cleans up the league at the end.
const BASE = process.env.BASE_URL || 'http://localhost:3000';
const USER = process.env.ADMIN_USER || 'aatir';
const PIN = process.env.ADMIN_PIN || '2468';

let cookie = '';

async function api(path, opts = {}) {
  const res = await fetch(`${BASE}${path}`, {
    ...opts,
    headers: { 'content-type': 'application/json', cookie, ...(opts.headers || {}) },
  });
  const setCookie = res.headers.get('set-cookie');
  if (setCookie) cookie = setCookie.split(';')[0];
  let body = null;
  try {
    body = await res.json();
  } catch {}
  return { status: res.status, body };
}

function fail(msg) {
  console.error(`FAIL: ${msg}`);
  process.exit(1);
}

async function main() {
  const login = await api('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ username: USER, pin: PIN }),
  });
  if (login.status !== 200) fail(`login ${login.status}: ${JSON.stringify(login.body)}`);
  console.log(`signed in as ${USER}`);

  const created = await api('/api/dev/test-draft', {
    method: 'POST',
    body: JSON.stringify({ managers: 4, bot_speed_ms: 800 }),
  });
  if (created.status !== 200) fail(`create ${created.status}: ${JSON.stringify(created.body)}`);
  const leagueId = created.body.leagueId;
  console.log(`test league ${leagueId}`);

  const started = await api(`/api/draft/${leagueId}/start`, { method: 'POST' });
  if (started.status !== 200) fail(`start ${started.status}: ${JSON.stringify(started.body)}`);
  console.log('draft started');

  const pool = (await api('/api/players/pool')).body.players;
  let racedOnce = false;
  let myPicks = 0;
  const t0 = Date.now();

  while (true) {
    if (Date.now() - t0 > 570_000) fail('draft did not complete within 9.5 minutes');
    const { status, body: state } = await api(`/api/draft/${leagueId}/state`);
    if (status !== 200) fail(`state ${status}`);
    if (state.draftStatus === 'complete') break;

    const me = state.members.find((m) => !m.isBot);
    if (state.currentPicker && state.currentPicker.userId === me.userId) {
      const taken = new Set(state.takenIds);
      const counts = { GK: 0, DEF: 0, MID: 0, FWD: 0 };
      for (const p of state.squads[me.userId] ?? []) counts[p.position]++;
      const quotas = { GK: 2, DEF: 5, MID: 5, FWD: 3 };
      const choice = pool.find(
        (p) => !taken.has(p.fplId) && counts[p.position] < quotas[p.position],
      );
      const payload = JSON.stringify({ fplId: choice.fplId, pickNumber: state.currentPick });
      if (!racedOnce) {
        // Double-tap race: two simultaneous picks of the same player.
        racedOnce = true;
        const [a, b] = await Promise.all([
          api(`/api/draft/${leagueId}/pick`, { method: 'POST', body: payload }),
          api(`/api/draft/${leagueId}/pick`, { method: 'POST', body: payload }),
        ]);
        const oks = [a, b].filter((r) => r.status === 200).length;
        if (oks !== 1) fail(`race produced ${oks} successes (want exactly 1): ${JSON.stringify([a.body, b.body])}`);
        console.log(`race OK: one success, one clean error ("${(a.status === 200 ? b : a).body.error}")`);
      } else {
        const res = await api(`/api/draft/${leagueId}/pick`, { method: 'POST', body: payload });
        if (res.status !== 200) {
          console.log(`pick rejected (${res.body.error}), repolling`);
          continue;
        }
      }
      myPicks++;
      console.log(`my pick ${myPicks}/15: ${choice.webName} (${choice.position})`);
    }
    await new Promise((r) => setTimeout(r, 400));
  }

  console.log('draft complete, verifying squads...');
  const { body: final } = await api(`/api/draft/${leagueId}/state`);
  const seen = new Set();
  for (const m of final.members) {
    const squad = final.squads[m.userId] ?? [];
    if (squad.length !== 15) fail(`${m.username} has ${squad.length} players`);
    const counts = { GK: 0, DEF: 0, MID: 0, FWD: 0 };
    for (const p of squad) {
      counts[p.position]++;
      if (seen.has(p.fplId)) fail(`duplicate ownership of ${p.webName}`);
      seen.add(p.fplId);
    }
    if (counts.GK !== 2 || counts.DEF !== 5 || counts.MID !== 5 || counts.FWD !== 3) {
      fail(`${m.username} quota ${JSON.stringify(counts)}`);
    }
    console.log(`  ${m.username}: 15 players, 2/5/5/3 OK`);
  }
  const autoCount = final.picks.filter((p) => p.autoPicked).length;
  console.log(`auto-picked entries in last 20 picks: ${autoCount} (bots pick auto)`);

  const del = await api(`/api/dev/test-draft?leagueId=${leagueId}`, { method: 'DELETE' });
  if (del.status !== 200) fail(`delete ${del.status}: ${JSON.stringify(del.body)}`);
  console.log('test league deleted, PASS');
}

main().catch((e) => fail(e.stack || String(e)));
