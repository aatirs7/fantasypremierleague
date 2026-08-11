import 'server-only';

// Scoring engine lands in the scoring phase. These entry points exist now so
// the sync pipeline's shape is final; both are safe no-ops until then.

export async function rescoreGwProvisional(gw: number, notes: string[]): Promise<void> {
  notes.push(`provisional rescore gw${gw}: scoring engine not built yet`);
}

export async function finalizeGw(gw: number, notes: string[]): Promise<void> {
  notes.push(`finalize gw${gw}: scoring engine not built yet`);
}
