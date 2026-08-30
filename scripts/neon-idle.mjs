// One-off: cut the Neon compute idle timeout from the 300s default to 60s.
//
// This is the single biggest lever on compute cost. Neon bills from the first
// query until the endpoint suspends, so every cron tick costs "query time +
// idle timeout". At 300s a 5-minute cron never lets the endpoint sleep at all
// and bills 24h a day; at 60s the same schedule bills about 5h a day.
//
// Needs a reachable project: while an org is over quota the control plane
// refuses endpoint changes with a 412, so run this once billing is sorted.
//   node scripts/neon-idle.mjs <projectId> <endpointId>
import fs from 'fs';
import os from 'os';
import path from 'path';

const [projectId, endpointId] = process.argv.slice(2);
if (!projectId || !endpointId) {
  console.error('usage: node scripts/neon-idle.mjs <projectId> <endpointId>');
  process.exit(1);
}

const credPath = path.join(os.homedir(), '.config', 'neonctl', 'credentials.json');
const token =
  process.env.NEON_API_KEY ?? JSON.parse(fs.readFileSync(credPath, 'utf8')).access_token;

const res = await fetch(
  `https://console.neon.tech/api/v2/projects/${projectId}/endpoints/${endpointId}`,
  {
    method: 'PATCH',
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: JSON.stringify({ endpoint: { suspend_timeout_seconds: 60 } }),
  },
);
const body = await res.json().catch(() => ({}));
if (!res.ok) {
  console.error(`failed (${res.status}):`, body.message ?? body);
  process.exit(1);
}
console.log('suspend_timeout_seconds now', body.endpoint?.suspend_timeout_seconds);
