'use client';

import { useCallback, useEffect, useState } from 'react';
import { Bell, BellOff, BellRing } from 'lucide-react';

// Notification opt-in. Deliberately never asks on load: browsers punish a
// permission prompt fired without a gesture by blocking it permanently, so
// the ask always follows a tap.

type State = 'unsupported' | 'default' | 'granted' | 'denied' | 'busy';

function urlBase64ToUint8Array(base64: string): Uint8Array {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4);
  const raw = atob((base64 + padding).replace(/-/g, '+').replace(/_/g, '/'));
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

export default function PushToggle({ variant = 'row' }: { variant?: 'row' | 'card' }) {
  const [state, setState] = useState<State>('default');
  const [subscribed, setSubscribed] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const sync = useCallback(async () => {
    if (typeof window === 'undefined') return;
    if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) {
      setState('unsupported');
      return;
    }
    setState(Notification.permission as State);
    try {
      const reg = await navigator.serviceWorker.getRegistration();
      const sub = await reg?.pushManager.getSubscription();
      setSubscribed(!!sub);
    } catch {
      setSubscribed(false);
    }
  }, []);

  useEffect(() => {
    void sync();
  }, [sync]);

  const enable = async () => {
    setError(null);
    setState('busy');
    try {
      const key = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
      if (!key) throw new Error('Notifications are not configured');
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') {
        setState(permission as State);
        return;
      }
      const reg = await navigator.serviceWorker.register('/sw.js');
      await navigator.serviceWorker.ready;
      const sub =
        (await reg.pushManager.getSubscription()) ??
        (await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(key) as BufferSource,
        }));
      const res = await fetch('/api/push', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(sub.toJSON()),
      });
      if (!res.ok) throw new Error('Could not save your subscription');
      setSubscribed(true);
      setState('granted');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not turn notifications on');
      await sync();
    }
  };

  const disable = async () => {
    setState('busy');
    try {
      const reg = await navigator.serviceWorker.getRegistration();
      const sub = await reg?.pushManager.getSubscription();
      if (sub) {
        await fetch('/api/push', {
          method: 'DELETE',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ endpoint: sub.endpoint }),
        });
        await sub.unsubscribe();
      }
      setSubscribed(false);
    } catch {
      // leave it on rather than lying about the state
    }
    await sync();
  };

  if (state === 'unsupported') return null;

  const on = state === 'granted' && subscribed;
  const blocked = state === 'denied';
  const busy = state === 'busy';

  const label = blocked
    ? 'Notifications blocked'
    : on
      ? 'Notifications on'
      : 'Turn on notifications';
  const sub = blocked
    ? 'Allow them in your browser settings for this site'
    : on
      ? 'Deadline reminders and your weekly result'
      : 'Get a nudge before each deadline';

  if (variant === 'card') {
    return (
      <div className="tile space-y-3 p-4 text-center">
        <BellRing className="mx-auto h-6 w-6 text-accent" strokeWidth={1.6} />
        <div>
          <p className="text-sm font-semibold">Never miss a deadline</p>
          <p className="mt-0.5 text-xs text-muted">
            One nudge before each gameweek locks, and your result when it settles.
          </p>
        </div>
        {error ? <p className="text-xs text-live">{error}</p> : null}
        <button
          onClick={on ? disable : enable}
          disabled={busy || blocked}
          className={on ? 'btn-outline w-full' : 'btn-primary w-full'}
        >
          {busy ? 'One moment...' : on ? 'Turn off' : blocked ? 'Blocked in browser' : 'Turn on'}
        </button>
      </div>
    );
  }

  return (
    <button
      onClick={on ? disable : enable}
      disabled={busy || blocked}
      className="flex min-h-14 w-full items-center gap-3 px-2.5 text-left"
    >
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-accent/12 text-accent">
        {on ? <Bell className="h-4.5 w-4.5" strokeWidth={2.2} /> : <BellOff className="h-4.5 w-4.5" strokeWidth={2.2} />}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-bold">{label}</span>
        <span className="block text-xs text-muted">{error ?? sub}</span>
      </span>
      <span
        className={`h-6 w-10 shrink-0 rounded-full p-0.5 transition-colors ${
          on ? 'bg-accent' : 'bg-white/[0.12]'
        }`}
      >
        <span
          className={`block h-5 w-5 rounded-full bg-white transition-transform ${
            on ? 'translate-x-4' : ''
          }`}
        />
      </span>
    </button>
  );
}
