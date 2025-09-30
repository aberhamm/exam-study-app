"use client";
import { useEffect, useState } from "react";
import type { NormalizedQuestion } from "@/types/normalized";
import type { TestSettings } from "@/lib/test-settings";
import type { PrepareQuestionsRequest, PrepareQuestionsResponse } from "@/types/api";

type UsePreparedQuestionsOptions = {
  enabled?: boolean;
};

export function usePreparedQuestions(
  examId: string,
  settings: TestSettings,
  options?: UsePreparedQuestionsOptions
) {
  const [data, setData] = useState<NormalizedQuestion[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const enabled = options?.enabled !== false;

  useEffect(() => {
    if (!enabled) {
      setLoading(false);
      return;
    }

    let cancelled = false;

    const run = async () => {
      setLoading(true);
      setError(null);
      try {
        const payload: PrepareQuestionsRequest = {
          questionType: settings.questionType,
          explanationFilter: settings.explanationFilter,
          questionCount: settings.questionCount,
        };
        const res = await fetch(`/api/exams/${encodeURIComponent(examId)}/questions/prepare`, {
          method: 'POST',
          cache: 'no-store',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        if (!res.ok) {
          const details: unknown = await res.json().catch(() => ({}));
          const hasStringError = (value: unknown): value is { error: string } =>
            typeof value === 'object' && value !== null && 'error' in value && typeof (value as { error: unknown }).error === 'string';
          const message = hasStringError(details)
            ? details.error
            : `HTTP ${res.status}: ${res.statusText}`;
          throw new Error(message);
        }
        const json: PrepareQuestionsResponse = await res.json();
        if (!cancelled) {
          setData(json.questions);
        }
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : 'Failed to prepare questions.');
          setData(null);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    run();

    return () => {
      cancelled = true;
    };
  }, [examId, settings.questionType, settings.explanationFilter, settings.questionCount, enabled]);

  return { data, error, loading } as const;
}
