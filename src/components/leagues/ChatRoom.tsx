'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Send } from 'lucide-react';
import Avatar from '@/components/Avatar';

type ChatMessage = {
  id: string;
  username: string | null;
  body: string;
  createdAt: string;
};

// League smack talk. Polls while open so a running argument stays live.
export default function ChatRoom({
  leagueId,
  myUsername,
}: {
  leagueId: string;
  myUsername: string;
}) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/chat/${leagueId}`, { cache: 'no-store' });
      if (!res.ok) return;
      const data = (await res.json()) as { messages: ChatMessage[] };
      setMessages(data.messages);
    } catch {
      // next poll wins
    }
  }, [leagueId]);

  useEffect(() => {
    void load();
    const id = setInterval(() => void load(), 10000);
    return () => clearInterval(id);
  }, [load]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'end' });
  }, [messages.length]);

  const send = async () => {
    const body = text.trim();
    if (!body || busy) return;
    setBusy(true);
    setText('');
    try {
      const res = await fetch(`/api/chat/${leagueId}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ body }),
      });
      if (res.ok) {
        const data = (await res.json()) as { messages: ChatMessage[] };
        setMessages(data.messages);
      }
    } catch {
      setText(body);
    }
    setBusy(false);
  };

  return (
    <div className="space-y-3">
      <div className="space-y-2.5">
        {messages.length === 0 ? (
          <p className="card p-5 text-center text-sm text-muted">
            Nothing said yet. Someone has to start it.
          </p>
        ) : null}
        {messages.map((m) => {
          if (!m.username) {
            return (
              <div key={m.id} className="tile p-3 text-center">
                <p className="whitespace-pre-line text-xs text-muted">{m.body}</p>
              </div>
            );
          }
          const mine = m.username === myUsername;
          return (
            <div key={m.id} className={`flex gap-2 ${mine ? 'flex-row-reverse' : ''}`}>
              <Avatar name={m.username} size={28} />
              <div className={`max-w-[76%] ${mine ? 'text-right' : ''}`}>
                <p className="text-[0.6rem] text-muted-2">{mine ? 'You' : m.username}</p>
                <p
                  className={`mt-0.5 inline-block rounded-2xl px-3 py-2 text-sm ${
                    mine
                      ? 'bg-[var(--btn-bg)] text-[var(--btn-fg)]'
                      : 'border border-edge bg-[var(--surface)]'
                  }`}
                >
                  {m.body}
                </p>
              </div>
            </div>
          );
        })}
        <div ref={endRef} />
      </div>

      <div className="glass sticky bottom-2 flex gap-2 rounded-full p-1.5">
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') void send();
          }}
          maxLength={500}
          placeholder="Say something"
          className="min-h-11 flex-1 rounded-full bg-transparent px-4 text-sm outline-none placeholder:text-muted-2"
        />
        <button
          onClick={() => void send()}
          disabled={busy || !text.trim()}
          aria-label="Send"
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[var(--btn-bg)] text-[var(--btn-fg)] disabled:opacity-30"
        >
          <Send className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
