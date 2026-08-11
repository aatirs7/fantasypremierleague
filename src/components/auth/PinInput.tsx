'use client';

import { useRef } from 'react';

// Four large OTP-style boxes with a numeric keyboard. The real value lives
// in the parent; each box shows a dot once filled.
export default function PinInput({
  value,
  onChange,
  label,
}: {
  value: string;
  onChange: (pin: string) => void;
  label: string;
}) {
  const refs = [
    useRef<HTMLInputElement>(null),
    useRef<HTMLInputElement>(null),
    useRef<HTMLInputElement>(null),
    useRef<HTMLInputElement>(null),
  ];

  const setDigit = (idx: number, digit: string) => {
    const next = (value.slice(0, idx) + digit + value.slice(idx + 1)).slice(0, 4);
    onChange(next);
    if (digit && idx < 3) refs[idx + 1].current?.focus();
  };

  const onKeyDown = (idx: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace') {
      e.preventDefault();
      if (value[idx]) {
        onChange(value.slice(0, idx) + value.slice(idx + 1));
      } else if (idx > 0) {
        onChange(value.slice(0, idx - 1));
        refs[idx - 1].current?.focus();
      }
    }
  };

  return (
    <div>
      <p className="mb-2 text-[0.65rem] font-bold uppercase tracking-[0.2em] text-muted">{label}</p>
      <div className="flex justify-center gap-3">
        {[0, 1, 2, 3].map((i) => (
          <input
            key={i}
            ref={refs[i]}
            type="password"
            inputMode="numeric"
            pattern="[0-9]*"
            maxLength={1}
            autoComplete="off"
            value={value[i] ?? ''}
            onChange={(e) => {
              const d = e.target.value.replace(/\D/g, '').slice(-1);
              setDigit(i, d);
            }}
            onKeyDown={(e) => onKeyDown(i, e)}
            onFocus={(e) => e.target.select()}
            className="h-16 w-14 rounded-xl border border-edge bg-white/[0.03] text-center text-2xl outline-none focus:border-accent/60"
            aria-label={`PIN digit ${i + 1}`}
          />
        ))}
      </div>
    </div>
  );
}
