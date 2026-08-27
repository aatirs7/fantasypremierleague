import 'server-only';
import webpush from 'web-push';
import { inArray } from 'drizzle-orm';
import { db } from './db';
import { pushSubscriptions } from './schema';

// Web push, keyed on VAPID. Sending is best effort by design: a dead
// subscription is deleted rather than retried, and one failure never stops
// the rest of a broadcast.

let configured = false;
function configure(): boolean {
  if (configured) return true;
  const pub = process.env.VAPID_PUBLIC_KEY;
  const priv = process.env.VAPID_PRIVATE_KEY;
  if (!pub || !priv) return false;
  webpush.setVapidDetails('mailto:noreply@fantasypremierleague.vercel.app', pub, priv);
  configured = true;
  return true;
}

export type PushPayload = { title: string; body: string; url?: string; tag?: string };

export async function sendToUsers(userIds: string[], payload: PushPayload): Promise<number> {
  if (!configure() || !userIds.length) return 0;
  const subs = await db
    .select()
    .from(pushSubscriptions)
    .where(inArray(pushSubscriptions.userId, userIds));
  if (!subs.length) return 0;

  const dead: string[] = [];
  let sent = 0;
  await Promise.all(
    subs.map(async (s) => {
      try {
        await webpush.sendNotification(
          { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
          JSON.stringify(payload),
        );
        sent++;
      } catch (e) {
        const code = (e as { statusCode?: number }).statusCode;
        // 404/410 mean the browser threw the subscription away.
        if (code === 404 || code === 410) dead.push(s.endpoint);
      }
    }),
  );
  if (dead.length) {
    await db.delete(pushSubscriptions).where(inArray(pushSubscriptions.endpoint, dead));
  }
  return sent;
}
