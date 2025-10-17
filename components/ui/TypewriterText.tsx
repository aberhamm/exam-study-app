'use client';

import { useEffect, useRef, useState } from 'react';

type Props = {
  text: string;
  enabled?: boolean;
  speed?: number; // chars per step
  className?: string;
  render?: (s: string) => React.ReactNode;
  children?: never;
};

export default function TypewriterText({ text, enabled = true, speed = 24, className, render }: Props) {
  const [display, setDisplay] = useState('');
  const idxRef = useRef(0);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    const reduced = typeof window !== 'undefined' && window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (!enabled || reduced) {
      setDisplay(text);
      return;
    }
    setDisplay('');
    idxRef.current = 0;

    const step = () => {
      idxRef.current = Math.min(text.length, idxRef.current + speed);
      setDisplay(text.slice(0, idxRef.current));
      if (idxRef.current < text.length) {
        rafRef.current = window.setTimeout(step, 40) as unknown as number;
      }
    };

    step();

    return () => {
      if (rafRef.current) window.clearTimeout(rafRef.current);
    };
  }, [text, enabled, speed]);

  return <div className={className}>{render ? render(display) : display}</div>;
}
