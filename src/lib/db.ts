import { neon, neonConfig, Pool } from '@neondatabase/serverless';
import { drizzle, type NeonHttpDatabase } from 'drizzle-orm/neon-http';
import { drizzle as drizzleWs, type NeonDatabase } from 'drizzle-orm/neon-serverless';
import ws from 'ws';
import * as schema from './schema';

// neon-http works in Vercel serverless, edge, and plain Node (seed script),
// so every read/simple-write path shares this one client. Lazily initialized
// so importing this module at build time does not require DATABASE_URL.
let client: NeonHttpDatabase<typeof schema> | null = null;

function getDb(): NeonHttpDatabase<typeof schema> {
  if (!client) {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error('DATABASE_URL is not set');
    client = drizzle(neon(url), { schema });
  }
  return client;
}

export const db: NeonHttpDatabase<typeof schema> = new Proxy(
  {} as NeonHttpDatabase<typeof schema>,
  {
    get(_target, prop) {
      const real = getDb() as unknown as Record<string | symbol, unknown>;
      const value = real[prop];
      return typeof value === 'function' ? (value as (...a: unknown[]) => unknown).bind(real) : value;
    },
  },
);

export type Tx = Parameters<Parameters<NeonDatabase<typeof schema>['transaction']>[0]>[0];

// neon-http cannot run multi-statement interactive transactions, and the
// draft/waiver/trade paths need pg_advisory_xact_lock held across several
// statements. Those paths run here: a short-lived WebSocket Pool per
// invocation (the serverless-recommended shape), closed in finally.
export async function withTransaction<T>(fn: (tx: Tx) => Promise<T>): Promise<T> {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL is not set');
  // Node runtimes below 22 lack a global WebSocket; wire in ws for all.
  neonConfig.webSocketConstructor = ws;
  const pool = new Pool({ connectionString: url });
  try {
    const dbTx = drizzleWs(pool, { schema });
    return await dbTx.transaction(fn);
  } finally {
    await pool.end();
  }
}
