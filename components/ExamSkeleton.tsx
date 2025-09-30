"use client";

import { useEffect } from 'react';
import { useHeader } from '@/contexts/HeaderContext';

type Props = {
  examTitle?: string;
};

export default function ExamSkeleton({ examTitle }: Props) {
  const { setConfig } = useHeader();

  useEffect(() => {
    setConfig({
      variant: 'short',
      title: examTitle,
      leftContent: null,
      rightContent: null,
      visible: true,
    });
  }, [setConfig, examTitle]);

  return (
    <div className="space-y-6" aria-busy="true" aria-live="polite">
      {/* Top Bar: Timer + Progress */}
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="h-6 w-24 rounded bg-muted animate-pulse" />
          <div className="h-6 w-16 rounded bg-muted animate-pulse" />
        </div>
        <div className="flex-1 h-2 bg-muted rounded animate-pulse" />
      </div>

      {/* Question Card */}
      <div className="rounded-lg border bg-card p-6">
        <div className="space-y-3 mb-6">
          <div className="h-5 w-2/3 rounded bg-muted animate-pulse" />
          <div className="h-5 w-1/2 rounded bg-muted animate-pulse" />
        </div>

        <div className="space-y-3">
          <div className="h-12 w-full rounded-lg border bg-muted/50 animate-pulse" />
          <div className="h-12 w-full rounded-lg border bg-muted/50 animate-pulse" />
          <div className="h-12 w-full rounded-lg border bg-muted/50 animate-pulse" />
          <div className="h-12 w-full rounded-lg border bg-muted/50 animate-pulse" />
          <div className="h-12 w-full rounded-lg border bg-muted/50 animate-pulse" />
        </div>

        <div className="mt-6 h-10 w-full rounded-lg bg-muted animate-pulse" />
      </div>

      <div className="text-center text-sm text-muted-foreground">
        Preparing your exam…
      </div>
    </div>
  );
}

