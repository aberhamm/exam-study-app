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
      {/* Exam Title Header */}
      {examTitle && (
        <div className="text-center lg:text-left">
          <h1 className="text-2xl font-bold">{examTitle}</h1>
        </div>
      )}

      {/* Mobile Header Actions */}
      <div className="md:hidden flex justify-between items-center text-sm">
        <div className="flex items-center gap-2">
          <div className="h-6 w-20 rounded bg-muted animate-pulse" />
          <span className="text-muted-foreground">•</span>
          <div className="h-6 w-24 rounded bg-muted animate-pulse" />
        </div>
        <div className="h-8 w-32 rounded bg-muted animate-pulse" />
      </div>

      {/* Timer + Progress */}
      <div className="flex items-center justify-between gap-6">
        <div className="flex-shrink-0 w-1/4">
          <div className="h-6 w-24 rounded bg-muted animate-pulse" />
        </div>
        <div className="flex-grow">
          <div className="h-6 w-32 mx-auto rounded bg-muted animate-pulse mb-2" />
          <div className="w-full h-2 bg-muted rounded animate-pulse" />
        </div>
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

