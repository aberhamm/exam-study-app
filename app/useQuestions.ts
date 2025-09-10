// src/app/useQuestions.ts
"use client";
import { useEffect, useState } from "react";
import { ExternalQuestionsFileZ } from "@/lib/validation";
import { normalizeQuestions } from "@/lib/normalize";
import type { NormalizedQuestion } from "@/types/normalized";

export function useQuestions() {
  const [data, setData] = useState<NormalizedQuestion[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/questions.json", { cache: "no-store" });
        const json = await res.json();
        const parsed = ExternalQuestionsFileZ.parse(json);
        setData(normalizeQuestions(parsed.questions));
      } catch (e) {
        setError("Failed to load questions.");
        console.error(e);
      }
    })();
  }, []);

  return { data, error, loading: !data && !error };
}
