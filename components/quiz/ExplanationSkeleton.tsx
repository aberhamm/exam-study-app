"use client";

import { useEffect, useMemo, useRef, useState } from 'react';

type Props = {
  lines?: number;
  withHeader?: boolean;
  withSources?: boolean;
  className?: string;
  bare?: boolean; // if true, render without container styling
};

export default function ExplanationSkeleton({
  lines = 6,
  withHeader = false,
  withSources = false,
  className,
  bare = false,
}: Props) {
  const [visible, setVisible] = useState(0);
  const timerRef = useRef<number | null>(null);

  const reducedMotion = useMemo(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return false;
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }, []);

  useEffect(() => {
    if (reducedMotion) {
      setVisible(lines);
      return;
    }

    setVisible(0);
    const step = () => {
      setVisible((v) => {
        if (v >= lines) return v;
        const next = v + 1;
        if (next >= lines && timerRef.current) {
          window.clearInterval(timerRef.current);
          timerRef.current = null;
        }
        return next;
      });
    };

    // Progressive reveal cadence
    timerRef.current = window.setInterval(step, 160) as unknown as number;
    return () => {
      if (timerRef.current) window.clearInterval(timerRef.current);
    };
  }, [lines, reducedMotion]);

  // Generate an array of widths to avoid uniform blocks
  const widths = useMemo(() => {
    const arr: string[] = [];
    for (let i = 0; i < lines; i++) {
      const mod = i % 5;
      if (mod === 0) arr.push('w-[95%]');
      else if (mod === 1) arr.push('w-[88%]');
      else if (mod === 2) arr.push('w-[82%]');
      else if (mod === 3) arr.push('w-[76%]');
      else arr.push('w-[90%]');
    }
    return arr;
  }, [lines]);

  const Container: React.FC<{ children: React.ReactNode }> = ({ children }) =>
    bare ? (
      <div className={className || ''} aria-busy="true" aria-live="polite">{children}</div>
    ) : (
      <div
        className={`border border-purple-200 dark:border-purple-800 bg-purple-50 dark:bg-purple-950/50 p-4 ${className || ''}`}
        aria-busy="true"
        aria-live="polite"
      >
        {children}
      </div>
    );

  return (
    <Container>
      {withHeader && (
        <div className="flex items-center gap-2 mb-3 text-purple-800 dark:text-purple-200">
          <div className="h-4 w-4 rounded-full bg-purple-300 dark:bg-purple-700 animate-pulse" />
          <div className="h-4 w-40 rounded bg-purple-200 dark:bg-purple-800 animate-pulse" />
        </div>
      )}

      <div className="space-y-2">
        {Array.from({ length: reducedMotion ? lines : Math.min(visible, lines) }).map((_, i) => (
          <div
            key={i}
            className={`h-4 ${widths[i]} rounded bg-muted animate-pulse`}
          />
        ))}
        {/* Last line shorter to suggest paragraph end */}
        {(!reducedMotion && visible >= lines) || reducedMotion ? (
          <div className="h-4 w-1/2 rounded bg-muted animate-pulse" />
        ) : null}
      </div>

      {withSources && (
        <div className="mt-3 flex flex-wrap gap-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <div
              key={i}
              className="h-5 w-28 rounded-full border border-border bg-muted/50 animate-pulse"
            />
          ))}
        </div>
      )}
    </Container>
  );
}
