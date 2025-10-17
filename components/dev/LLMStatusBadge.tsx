'use client';

import { useEffect, useState } from 'react';

type Status = { used: number; limit: number; windowMs: number; windowCount: number; remainingRequests: number } | null;

export default function LLMStatusBadge() {
  const [status, setStatus] = useState<Status>(null);

  useEffect(() => {
    let timer: number | null = null;
    const fetchStatus = async () => {
      try {
        const resp = await fetch('/api/llm/status', { cache: 'no-store' });
        const json = await resp.json();
        if (resp.ok) setStatus(json.status as Status);
      } catch {}
    };
    fetchStatus();
    timer = window.setInterval(fetchStatus, 3000) as unknown as number;
    return () => {
      if (timer) window.clearInterval(timer);
    };
  }, []);

  const busy = (status?.used ?? 0) > 0;
  const text = busy ? `LLM: Busy (${status?.used}/${status?.limit})` : 'LLM: Free';

  return (
    <span
      className={
        `inline-flex items-center px-2 py-1 text-xs rounded-md border ` +
        (busy
          ? 'bg-amber-50 dark:bg-amber-950/30 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-800'
          : 'bg-emerald-50 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800')
      }
      title={status ? `Window: ${Math.round(status.windowMs / 1000)}s · Remaining: ${status.remainingRequests}` : '—'}
      aria-live="polite"
    >
      {text}
    </span>
  );
}

