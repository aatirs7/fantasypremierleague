'use client';

import { useState } from 'react';
import Onboard from './Onboard';
import PLLion from '@/components/PLLion';

// Two-step onboarding, per the reference design: hero with the lion and
// "Build. Compete. Dominate.", then the PIN form for the chosen mode.
export default function Welcome({ next, kickoffLine }: { next?: string; kickoffLine?: string }) {
  const [mode, setMode] = useState<'hidden' | 'register' | 'login'>('hidden');

  if (mode !== 'hidden') {
    return (
      <div className="reveal mx-auto w-full max-w-sm space-y-5 py-6 text-center">
        <button
          onClick={() => setMode('hidden')}
          className="block text-sm font-semibold text-muted"
          aria-label="back"
        >
          &larr; Back
        </button>
        <div className="text-center">
          <PLLion className="mx-auto h-14 w-auto text-foreground" />
          <h1 className="mt-3 text-2xl font-bold tracking-tight">
            {mode === 'register' ? 'Create your account' : 'Welcome back'}
          </h1>
        </div>
        <Onboard next={next} initialMode={mode} />
      </div>
    );
  }

  return (
    <div className="reveal mx-auto flex min-h-[88vh] w-full max-w-sm flex-col items-center justify-center gap-10 py-8 text-center">
      <PLLion className="h-44 w-auto text-foreground drop-shadow-[0_0_40px_rgba(139,92,246,0.35)]" />

      <div className="space-y-3">
        <h1 className="text-[2.6rem] font-bold leading-[1.08] tracking-tight">
          Build. Compete.
          <span className="shine block">Dominate.</span>
        </h1>
        <p className="text-[0.95rem] text-muted">Your Premier League. Your way.</p>
        {kickoffLine ? <p className="text-xs text-muted-2">{kickoffLine}</p> : null}
      </div>

      <div className="w-full space-y-3">
        <button onClick={() => setMode('register')} className="btn-primary w-full">
          Get Started
        </button>
        <button onClick={() => setMode('login')} className="btn-outline w-full">
          Log In
        </button>
        <p className="pt-1 text-[0.65rem] text-muted-2">Made by Aatir Siddiqui</p>
      </div>
    </div>
  );
}
