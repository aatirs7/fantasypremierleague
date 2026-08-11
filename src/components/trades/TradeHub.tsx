'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowLeftRight, X } from 'lucide-react';

// Trade hub: build an offer by tapping players on both sides, plus inbox
// (accept/reject), outgoing (cancel), and owner veto on accepted trades.

type TradePlayer = {
  fplId: number;
  webName: string;
  position: string;
  clubShort: string;
  totalPoints: number;
  form: string | null;
};

type TradeRow = {
  id: string;
  proposerId: string;
  proposerName: string;
  receiverId: string;
  receiverName: string;
  offer: string[];
  request: string[];
  status: string;
  proposedAt: string;
  executesAt: string | null;
};

type TradesData = {
  vetoEnabled: boolean;
  isOwner: boolean;
  frozen: boolean;
  squads: { userId: string; username: string; isBot: boolean; players: TradePlayer[] }[];
  trades: TradeRow[];
};

const POS_CLS: Record<string, string> = {
  GK: 'bg-gold/15 text-gold',
  DEF: 'bg-silver/15 text-silver',
  MID: 'bg-accent/15 text-accent',
  FWD: 'bg-[#a78bfa]/15 text-[#a78bfa]',
};

export default function TradeHub({ leagueId, myUserId }: { leagueId: string; myUserId: string }) {
  const [data, setData] = useState<TradesData | null>(null);
  const [partnerId, setPartnerId] = useState<string | null>(null);
  const [offer, setOffer] = useState<number[]>([]);
  const [request, setRequest] = useState<number[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/trades/${leagueId}`, { cache: 'no-store' });
      if (res.ok) setData((await res.json()) as TradesData);
    } catch {
      // next load wins
    }
  }, [leagueId]);

  useEffect(() => {
    void load();
  }, [load]);

  const act = async (payload: object) => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/trades/${leagueId}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const body = (await res.json()) as { error?: string };
      if (!res.ok) setError(body.error ?? 'Something went wrong');
      else if ((payload as { action?: string }).action === 'propose') {
        setOffer([]);
        setRequest([]);
        setPartnerId(null);
      }
      await load();
    } catch {
      setError('Network error, try again');
    }
    setBusy(false);
  };

  const mySquad = useMemo(
    () => data?.squads.find((s) => s.userId === myUserId)?.players ?? [],
    [data, myUserId],
  );
  const partners = useMemo(
    () => (data?.squads ?? []).filter((s) => s.userId !== myUserId && !s.isBot),
    [data, myUserId],
  );
  const partner = partners.find((p) => p.userId === partnerId) ?? null;

  if (!data) return <p className="py-10 text-center text-sm text-muted">Loading trades...</p>;

  const toggle = (list: number[], set: (v: number[]) => void, id: number) => {
    if (list.includes(id)) set(list.filter((x) => x !== id));
    else if (list.length < 3) set([...list, id]);
  };

  const inbox = data.trades.filter((t) => t.status === 'pending' && t.receiverId === myUserId);
  const outgoing = data.trades.filter((t) => t.status === 'pending' && t.proposerId === myUserId);
  const vetoable = data.trades.filter((t) => t.status === 'accepted');
  const historic = data.trades.filter((t) => !['pending', 'accepted'].includes(t.status)).slice(0, 12);

  const PlayerChip = ({
    p,
    active,
    onTap,
  }: {
    p: TradePlayer;
    active: boolean;
    onTap: () => void;
  }) => (
    <button
      onClick={onTap}
      className={`flex items-center gap-1.5 rounded-full border px-2.5 py-1.5 text-xs font-semibold ${
        active ? 'border-accent bg-accent/15 text-accent' : 'border-edge bg-white/[0.02] text-foreground'
      }`}
    >
      <span className={`rounded-full px-1 py-0 text-[0.55rem] font-bold ${POS_CLS[p.position] ?? ''}`}>
        {p.position}
      </span>
      {p.webName}
    </button>
  );

  const TradeCard = ({ t, actions }: { t: TradeRow; actions: React.ReactNode }) => (
    <div className="card space-y-1.5 p-3 text-sm">
      <p className="text-xs text-muted">
        <span className="font-bold text-foreground">{t.proposerName}</span> offers{' '}
        <span className="font-bold text-accent">{t.offer.join(', ')}</span> to{' '}
        <span className="font-bold text-foreground">{t.receiverName}</span> for{' '}
        <span className="font-bold text-gold">{t.request.join(', ')}</span>
      </p>
      {t.executesAt && t.status === 'accepted' ? (
        <p className="text-[0.65rem] text-muted-2">
          Executes {new Date(t.executesAt).toLocaleString('en-GB', { weekday: 'short', hour: '2-digit', minute: '2-digit' })} unless vetoed
        </p>
      ) : null}
      {actions}
    </div>
  );

  return (
    <div className="space-y-3">
      {data.frozen ? (
        <p className="rounded-xl border border-gold/30 bg-gold/[0.08] px-3 py-2 text-xs text-gold">
          Trades are frozen while the gameweek plays out. Back after the final whistle.
        </p>
      ) : null}
      {error ? (
        <button
          onClick={() => setError(null)}
          className="flex w-full items-center justify-between rounded-xl border border-live/40 bg-live/[0.08] px-3 py-2 text-left text-sm text-live"
        >
          {error} <X className="h-4 w-4 shrink-0" />
        </button>
      ) : null}

      {inbox.length ? (
        <div className="space-y-2">
          <p className="text-center text-[0.65rem] font-bold uppercase tracking-[0.2em] text-muted">Inbox</p>
          {inbox.map((t) => (
            <TradeCard
              key={t.id}
              t={t}
              actions={
                <div className="flex gap-2 pt-1">
                  <button
                    onClick={() => void act({ action: 'accept', tradeId: t.id })}
                    disabled={busy || data.frozen}
                    className="min-h-10 flex-1 rounded-xl bg-accent text-xs font-bold text-[var(--accent-ink)] disabled:opacity-40"
                  >
                    Accept
                  </button>
                  <button
                    onClick={() => void act({ action: 'reject', tradeId: t.id })}
                    disabled={busy}
                    className="min-h-10 flex-1 rounded-xl border border-edge text-xs font-bold text-muted"
                  >
                    Reject
                  </button>
                </div>
              }
            />
          ))}
        </div>
      ) : null}

      {outgoing.length ? (
        <div className="space-y-2">
          <p className="text-center text-[0.65rem] font-bold uppercase tracking-[0.2em] text-muted">Outgoing</p>
          {outgoing.map((t) => (
            <TradeCard
              key={t.id}
              t={t}
              actions={
                <button
                  onClick={() => void act({ action: 'cancel', tradeId: t.id })}
                  disabled={busy}
                  className="min-h-10 w-full rounded-xl border border-edge text-xs font-bold text-muted"
                >
                  Cancel offer
                </button>
              }
            />
          ))}
        </div>
      ) : null}

      {vetoable.length ? (
        <div className="space-y-2">
          <p className="text-center text-[0.65rem] font-bold uppercase tracking-[0.2em] text-muted">
            Accepted (veto window)
          </p>
          {vetoable.map((t) => (
            <TradeCard
              key={t.id}
              t={t}
              actions={
                data.isOwner ? (
                  <button
                    onClick={() => void act({ action: 'veto', tradeId: t.id })}
                    disabled={busy}
                    className="min-h-10 w-full rounded-xl border border-live/40 text-xs font-bold text-live"
                  >
                    Veto this trade
                  </button>
                ) : null
              }
            />
          ))}
        </div>
      ) : null}

      <div className="card space-y-3 p-4">
        <p className="text-center text-[0.65rem] font-bold uppercase tracking-[0.2em] text-muted">
          Propose a trade
        </p>
        {partners.length === 0 ? (
          <p className="text-xs text-muted">No other managers to trade with.</p>
        ) : (
          <>
            <div className="flex flex-wrap gap-1.5">
              {partners.map((p) => (
                <button
                  key={p.userId}
                  onClick={() => {
                    setPartnerId(p.userId === partnerId ? null : p.userId);
                    setRequest([]);
                  }}
                  className={`rounded-full border px-3 py-1.5 text-xs font-semibold ${
                    partnerId === p.userId
                      ? 'border-accent bg-accent/10 text-accent'
                      : 'border-edge bg-white/[0.02] text-muted'
                  }`}
                >
                  {p.username}
                </button>
              ))}
            </div>
            {partner ? (
              <>
                <p className="text-xs font-bold text-muted">You give (tap up to 3)</p>
                <div className="flex flex-wrap gap-1.5">
                  {mySquad.map((p) => (
                    <PlayerChip
                      key={p.fplId}
                      p={p}
                      active={offer.includes(p.fplId)}
                      onTap={() => toggle(offer, setOffer, p.fplId)}
                    />
                  ))}
                </div>
                <p className="text-xs font-bold text-muted">You get from {partner.username}</p>
                <div className="flex flex-wrap gap-1.5">
                  {partner.players.map((p) => (
                    <PlayerChip
                      key={p.fplId}
                      p={p}
                      active={request.includes(p.fplId)}
                      onTap={() => toggle(request, setRequest, p.fplId)}
                    />
                  ))}
                </div>
                <button
                  onClick={() =>
                    void act({
                      action: 'propose',
                      receiverId: partner.userId,
                      offerFplIds: offer,
                      requestFplIds: request,
                    })
                  }
                  disabled={busy || data.frozen || !offer.length || !request.length}
                  className="flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-accent text-sm font-bold text-[var(--accent-ink)] active:scale-95 disabled:opacity-40"
                >
                  <ArrowLeftRight className="h-4 w-4" />
                  Propose {offer.length}-for-{request.length}
                </button>
              </>
            ) : (
              <p className="text-xs text-muted">Pick a manager to start building an offer.</p>
            )}
          </>
        )}
      </div>

      {historic.length ? (
        <div className="card space-y-1.5 p-4">
          <p className="text-center text-[0.65rem] font-bold uppercase tracking-[0.2em] text-muted">History</p>
          {historic.map((t) => (
            <p key={t.id} className="text-xs text-muted">
              <span className="font-bold text-foreground">{t.proposerName}</span> to{' '}
              <span className="font-bold text-foreground">{t.receiverName}</span>: {t.offer.join(', ')}{' '}
              for {t.request.join(', ')}{' '}
              <span
                className={
                  t.status === 'executed' ? 'font-bold text-accent' : 'font-bold text-muted-2'
                }
              >
                {t.status}
              </span>
            </p>
          ))}
        </div>
      ) : null}
    </div>
  );
}
