// src/app/useQuestions.ts
"use client";
import { useEffect, useState } from "react";
import { ExamDetailZ } from "@/lib/validation";
import { normalizeQuestions } from "@/lib/normalize";
import type { ExamSummary, ExamsListResponse } from "@/types/api";
import type { NormalizedQuestion, ExamMetadata } from "@/types/normalized";

type UseQuestionsOptions = {
  enabled?: boolean;
};

export function useQuestions(examId: string = "sitecore-xmc", options?: UseQuestionsOptions) {
  const [data, setData] = useState<NormalizedQuestion[] | null>(null);
  const [examMetadata, setExamMetadata] = useState<ExamMetadata | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const enabled = options?.enabled !== false;

  useEffect(() => {
    if (!enabled) { setLoading(false); return; }
    const loadExamData = async () => {
      setLoading(true);
      setError(null);

      try {
        const res = await fetch(`/api/exams/${examId}`, { cache: "no-store" });
        if (!res.ok) {
          const details = await res.json().catch(() => ({}));
          const message = typeof details?.error === "string" ? details.error : `HTTP ${res.status}: ${res.statusText}`;
          throw new Error(message);
        }
        const json = await res.json();
        const parsed = ExamDetailZ.parse(json);
        setData(normalizeQuestions(parsed.questions));
        setExamMetadata({
          examId: parsed.examId ?? examId,
          examTitle: parsed.examTitle ?? "Study Exam",
          welcomeConfig: parsed.welcomeConfig,
        });
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to load questions.");
        console.error(e);
      } finally {
        setLoading(false);
      }
    };

    loadExamData();
  }, [examId, enabled]);

  return { data, examMetadata, error, loading };
}

export async function getAvailableExams(): Promise<string[]> {
  const res = await fetch(`/api/exams`, { cache: "no-store" });
  if (!res.ok) {
    const details = await res.json().catch(() => ({}));
    const message = typeof details?.error === "string" ? details.error : `HTTP ${res.status}: ${res.statusText}`;
    throw new Error(message);
  }
  const json: ExamsListResponse = await res.json();
  return json.exams.map((exam) => exam.examId);
}

export async function getExamSummaries(): Promise<ExamSummary[]> {
  const res = await fetch(`/api/exams`, { cache: "no-store" });
  if (!res.ok) {
    const details = await res.json().catch(() => ({}));
    const message = typeof details?.error === "string" ? details.error : `HTTP ${res.status}: ${res.statusText}`;
    throw new Error(message);
  }
  const json: ExamsListResponse = await res.json();
  return json.exams;
}
