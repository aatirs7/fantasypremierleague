import 'server-only';

// Trades land in the next phase; the cron hook exists now so sync.ts's
// shape is final.
export async function runTradeCron(_notes: string[]): Promise<void> {}
