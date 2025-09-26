// src/app/useQuestions.ts
"use client";
import { useEffect, useState } from "react";
import { ExternalQuestionsFileZ } from "@/lib/validation";
import { normalizeQuestions } from "@/lib/normalize";
import type { NormalizedQuestion, ExamMetadata } from "@/types/normalized";

export function useQuestions(examId: string = 'sitecore-xmc') {
  const [data, setData] = useState<NormalizedQuestion[] | null>(null);
  const [examMetadata, setExamMetadata] = useState<ExamMetadata | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(`/data/exams/${examId}.json`, { cache: "no-store" });
        const json = await res.json();
        const parsed = ExternalQuestionsFileZ.parse(json);
        setData(normalizeQuestions(parsed.questions));
        setExamMetadata({
          examId: parsed.examId || examId,
          examTitle: parsed.examTitle || 'Sitecore XM Cloud'
        });
      } catch (e) {
        setError("Failed to load questions.");
        console.error(e);
      }
    })();
  }, [examId]);

  return { data, examMetadata, error, loading: !data && !error };
}
