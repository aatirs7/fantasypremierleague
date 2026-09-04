'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowLeftRight, X } from 'lucide-react';
import LocalTime from '@/components/LocalTime';
import { suggestTrades, value } from '@/lib/trade-suggest';

// Trade hub: build an offer by tapping players on both sides, plus inbox
// (accept/reject), outgoing (cancel), and owner veto on accepted trades.

type TradePlayer = {
  fplId: number;
  webName: string;
  position: string;
  clubShort: string;
  totalPoints: number;
  form: string | null;
  lastSeasonPoints: number | null;
  draftRank: number | null;
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
  squads: { userId: string; username: string; isBot: boolean; players: TradePlayer[] }[];
  trades: TradeRow[];
};

const POS_CLS: Record<string, string> = {
  GK: 'bg-gold/15 text-gold',
  DEF: 'bg-silver/15 text-silver',
  MID: 'bg-accent/15 text-accent',
  FWD: 'bg-[#38bdf8]/15 text-[#38bdf8]',
};

export default function TradeHub({ leagueId, myUserId }: { leagueId: string; myUserId: string }) {
  const [data, setData] = useState<TradesData | null>(null);
  const [partnerId, setPartnerId] = useState<string | null>(null);
  const [tab, setTab] = useState<'ideas' | 'build' | 'activity'>('ideas');
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

  const ideas = useMemo(
    () =>
      mySquad.length
        ? suggestTrades(
            mySquad,
            partners.map((p) => ({ userId: p.userId, username: p.username, players: p.players })),
          )
        : [],
    [mySquad, partners],
  );

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
          Executes <LocalTime iso={t.executesAt} mode="weekday-time" /> unless vetoed
        </p>
      ) : null}
      {actions}
    </div>
  );


  // One player, one line: position tag, name, and what he is worth. The old
  // hub showed two walls of identical pills with no way to tell a starter
  // from a passenger.
  const PlayerLine = ({ p, tone }: { p: TradePlayer; tone: 'give' | 'get' }) => (
    <span className="flex items-center gap-1.5 text-xs">
      <span
        className={`w-8 shrink-0 rounded px-1 py-0.5 text-center text-[0.55rem] font-bold ${POS_CLS[p.position] ?? ''}`}
      >
        {p.position}
      </span>
      <span className="min-w-0 flex-1 truncate font-semibold">{p.webName}</span>
      <span className={`shrink-0 tabular-nums ${tone === 'get' ? 'text-accent' : 'text-muted-2'}`}>
        {value(p)}
      </span>
    </span>
  );

  return (
    <div className="space-y-3">
      {error ? (
        <button
          onClick={() => setError(null)}
          className="flex w-full items-center justify-between rounded-xl border border-live/40 bg-live/[0.08] px-3 py-2 text-left text-sm text-live"
        >
          {error} <X className="h-4 w-4 shrink-0" />
        </button>
      ) : null}

      <div className="flex justify-center gap-6 border-b border-edge">
        {(
          [
            ['ideas', 'Ideas'],
            ['build', 'Build'],
            ['activity', inbox.length ? `Activity (${inbox.length})` : 'Activity'],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            data-active={tab === key}
            className="tab-underline"
          >
            {label}
          </button>
        ))}
      </div>

      {tab === 'ideas' ? (
        ideas.length ? (
          <div className="space-y-2.5">
            <p className="text-center text-xs text-muted">
              Deals that would improve both squads. Every position count stays legal.
            </p>
            {ideas.map((s, i) => (
              <div key={i} className="tile space-y-3 p-3.5">
                <p className="text-center text-[0.7rem] leading-relaxed text-muted">{s.reason}</p>
                <div className="flex gap-3">
                  <div className="min-w-0 flex-1 space-y-1">
                    <p className="text-[0.55rem] font-medium uppercase tracking-wider text-muted-2">
                      You give
                    </p>
                    {s.give.map((p) => (
                      <PlayerLine key={p.fplId} p={p as TradePlayer} tone="give" />
                    ))}
                  </div>
                  <ArrowLeftRight className="mt-4 h-4 w-4 shrink-0 self-start text-muted-2" />
                  <div className="min-w-0 flex-1 space-y-1">
                    <p className="text-[0.55rem] font-medium uppercase tracking-wider text-muted-2">
                      You get
                    </p>
                    {s.get.map((p) => (
                      <PlayerLine key={p.fplId} p={p as TradePlayer} tone="get" />
                    ))}
                  </div>
                </div>
                <div className="flex items-center justify-center gap-4 text-[0.62rem]">
                  <span className="font-semibold text-accent">You +{s.yourGain}</span>
                  <span className="text-muted-2">
                    {s.partnerName} +{s.theirGain}
                  </span>
                </div>
                <button
                  onClick={() =>
                    void act({
                      action: 'propose',
                      receiverId: s.partnerId,
                      offerFplIds: s.give.map((p) => p.fplId),
                      requestFplIds: s.get.map((p) => p.fplId),
                    })
                  }
                  disabled={busy}
                  className="btn-primary min-h-10 w-full text-xs"
                >
                  Offer this to {s.partnerName}
                </button>
              </div>
            ))}
          </div>
        ) : (
          <p className="tile p-5 text-center text-sm text-muted">
            Nothing here would improve both squads right now. Build one by hand if you disagree.
          </p>
        )
      ) : null}

      {tab === 'build' ? (
        <div className="space-y-3">
          {partners.length === 0 ? (
            <p className="tile p-5 text-center text-sm text-muted">
              No other managers to trade with.
            </p>
          ) : (
            <>
              <div className="-mx-4 overflow-x-auto px-4">
                <div className="flex w-max gap-1.5">
                  {partners.map((p) => (
                    <button
                      key={p.userId}
                      onClick={() => {
                        setPartnerId(p.userId === partnerId ? null : p.userId);
                        setRequest([]);
                      }}
                      className={`rounded-full border px-3 py-1.5 text-xs font-semibold whitespace-nowrap ${
                        partnerId === p.userId
                          ? 'border-accent bg-accent/10 text-accent'
                          : 'border-edge text-muted'
                      }`}
                    >
                      {p.username}
                    </button>
                  ))}
                </div>
              </div>

              {partner ? (
                <div className="tile space-y-3 p-3.5">
                  <div className="grid grid-cols-2 gap-2">
                    <div className="space-y-1.5">
                      <p className="text-center text-[0.55rem] font-medium uppercase tracking-wider text-muted-2">
                        You give
                      </p>
                      {mySquad
                        .slice()
                        .sort((a, b) => value(b) - value(a))
                        .map((p) => (
                          <PlayerChip
                            key={p.fplId}
                            p={p}
                            active={offer.includes(p.fplId)}
                            onTap={() => toggle(offer, setOffer, p.fplId)}
                          />
                        ))}
                    </div>
                    <div className="space-y-1.5">
                      <p className="text-center text-[0.55rem] font-medium uppercase tracking-wider text-muted-2">
                        You get
                      </p>
                      {partner.players
                        .slice()
                        .sort((a, b) => value(b) - value(a))
                        .map((p) => (
                          <PlayerChip
                            key={p.fplId}
                            p={p}
                            active={request.includes(p.fplId)}
                            onTap={() => toggle(request, setRequest, p.fplId)}
                          />
                        ))}
                    </div>
                  </div>
                  <p className="text-center text-[0.62rem] text-muted-2">
                    Up to 3 each way. Both squads must still be 2/5/5/3 afterwards, so the
                    positions have to match.
                  </p>
                  <button
                    onClick={() =>
                      void act({
                        action: 'propose',
                        receiverId: partner.userId,
                        offerFplIds: offer,
                        requestFplIds: request,
                      })
                    }
                    disabled={busy || !offer.length || !request.length}
                    className="btn-primary w-full"
                  >
                    <ArrowLeftRight className="h-4 w-4" />
                    Propose {offer.length} for {request.length}
                  </button>
                </div>
              ) : (
                <p className="tile p-5 text-center text-sm text-muted">
                  Pick a manager to start building an offer.
                </p>
              )}
            </>
          )}
        </div>
      ) : null}

      {tab === 'activity' ? (
        <div className="space-y-3">
          {inbox.length ? (
            <div className="space-y-2">
              <p className="text-center text-[0.56rem] font-medium uppercase tracking-[0.22em] text-muted-2">
                Offers to you
              </p>
              {inbox.map((t) => (
                <TradeCard
                  key={t.id}
                  t={t}
                  actions={
                    <div className="flex gap-2 pt-1">
                      <button
                        onClick={() => void act({ action: 'accept', tradeId: t.id })}
                        disabled={busy}
                        className="btn-primary min-h-10 flex-1 text-xs"
                      >
                        Accept
                      </button>
                      <button
                        onClick={() => void act({ action: 'reject', tradeId: t.id })}
                        disabled={busy}
                        className="min-h-10 flex-1 rounded-xl border border-edge text-xs font-semibold text-muted"
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
              <p className="text-center text-[0.56rem] font-medium uppercase tracking-[0.22em] text-muted-2">
                Waiting on them
              </p>
              {outgoing.map((t) => (
                <TradeCard
                  key={t.id}
                  t={t}
                  actions={
                    <button
                      onClick={() => void act({ action: 'cancel', tradeId: t.id })}
                      disabled={busy}
                      className="min-h-10 w-full rounded-xl border border-edge text-xs font-semibold text-muted"
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
              <p className="text-center text-[0.56rem] font-medium uppercase tracking-[0.22em] text-muted-2">
                Accepted, veto window open
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
                        className="min-h-10 w-full rounded-xl border border-live/40 text-xs font-semibold text-live"
                      >
                        Veto this trade
                      </button>
                    ) : null
                  }
                />
              ))}
            </div>
          ) : null}

          {historic.length ? (
            <div className="tile space-y-1.5 p-4">
              <p className="text-center text-[0.56rem] font-medium uppercase tracking-[0.22em] text-muted-2">
                Settled
              </p>
              {historic.map((t) => (
                <p key={t.id} className="text-xs text-muted">
                  <span className="font-semibold text-foreground">{t.proposerName}</span> to{' '}
                  <span className="font-semibold text-foreground">{t.receiverName}</span>:{' '}
                  {t.offer.join(', ')} for {t.request.join(', ')}{' '}
                  <span
                    className={t.status === 'executed' ? 'font-semibold text-accent' : 'text-muted-2'}
                  >
                    {t.status}
                  </span>
                </p>
              ))}
            </div>
          ) : null}

          {!inbox.length && !outgoing.length && !vetoable.length && !historic.length ? (
            <p className="tile p-5 text-center text-sm text-muted">
              Nothing has been offered yet this season.
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
