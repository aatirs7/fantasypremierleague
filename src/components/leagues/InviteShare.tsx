'use client';

import { useState } from 'react';
import { Check, Copy, Share2 } from 'lucide-react';

export default function InviteShare({ code, leagueName }: { code: string; leagueName: string }) {
  const [copied, setCopied] = useState<'code' | 'link' | null>(null);

  const copy = async (text: string, kind: 'code' | 'link') => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(kind);
      setTimeout(() => setCopied(null), 1600);
    } catch {
      // clipboard blocked; nothing to do
    }
  };

  const share = async () => {
    // Built at click time to avoid SSR hydration mismatch.
    const link = `${window.location.origin}/join/${code}`;
    if (navigator.share) {
      try {
        await navigator.share({
          title: leagueName,
          text: `Join my fantasy draft league "${leagueName}"`,
          url: link,
        });
        return;
      } catch {
        // user dismissed; fall through to copy
      }
    }
    void copy(link, 'link');
  };

  return (
    <div className="card space-y-3 p-4">
      <p className="text-[0.65rem] font-bold uppercase tracking-[0.2em] text-muted">Invite code</p>
      <button
        onClick={() => copy(code, 'code')}
        className="flex w-full items-center justify-center gap-3 rounded-xl border border-edge bg-white/[0.03] py-3 active:scale-[0.99]"
      >
        <span className="font-mono text-2xl tracking-[0.3em] text-accent">{code}</span>
        {copied === 'code' ? <Check className="h-4 w-4 text-accent" /> : <Copy className="h-4 w-4 text-muted" />}
      </button>
      <button
        onClick={share}
        className="flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-accent px-4 text-sm font-bold text-[var(--accent-ink)] active:scale-95"
      >
        <Share2 className="h-4 w-4" />
        {copied === 'link' ? 'Link copied' : 'Share invite link'}
      </button>
    </div>
  );
}
