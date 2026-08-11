import 'server-only';
import { readSession } from './auth';

// Dev-only surface guard. ADMIN_USERNAMES is a comma-separated list of
// usernames; everyone else gets a 404 so the endpoints are invisible.
export async function currentAdminId(): Promise<string | null> {
  const session = await readSession();
  if (!session) return null;
  const admins = (process.env.ADMIN_USERNAMES ?? '')
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  return admins.includes(session.username.toLowerCase()) ? session.userId : null;
}
