// src/app/useQuestions.ts
"use client";
import { useEffect, useState } from "react";
import { ExternalQuestionsFileZ } from "@/lib/validation";
import { normalizeQuestions } from "@/lib/normalize";
import type { NormalizedQuestion, ExamMetadata } from "@/types/normalized";

// Static imports for available exams
import sitecoreXmcData from "@/data/exams/sitecore-xmc.json";

// Exam registry - add new exams here as they become available
const EXAM_REGISTRY = {
  'sitecore-xmc': sitecoreXmcData,
} as const;

type AvailableExamId = keyof typeof EXAM_REGISTRY;

export function useQuestions(examId: string = 'sitecore-xmc') {
  const [data, setData] = useState<NormalizedQuestion[] | null>(null);
  const [examMetadata, setExamMetadata] = useState<ExamMetadata | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadExamData = async () => {
      setLoading(true);
      setError(null);

      try {
        // Check if exam is in our static registry first
        if (examId in EXAM_REGISTRY) {
          const examData = EXAM_REGISTRY[examId as AvailableExamId];
          const parsed = ExternalQuestionsFileZ.parse(examData);
          setData(normalizeQuestions(parsed.questions));
          setExamMetadata({
            examId: parsed.examId || examId,
            examTitle: parsed.examTitle || 'Study Exam',
            welcomeConfig: parsed.welcomeConfig
          });
        } else {
          // Future: attempt to fetch dynamically
          // For now, this will try to fetch from public directory
          try {
            const res = await fetch(`/data/exams/${examId}.json`, { cache: "no-store" });
            if (!res.ok) {
              throw new Error(`HTTP ${res.status}: ${res.statusText}`);
            }
            const json = await res.json();
            const parsed = ExternalQuestionsFileZ.parse(json);
            setData(normalizeQuestions(parsed.questions));
            setExamMetadata({
              examId: parsed.examId || examId,
              examTitle: parsed.examTitle || 'Study Exam',
              welcomeConfig: parsed.welcomeConfig
            });
          } catch {
            throw new Error(`Exam "${examId}" not found. Available exams: ${Object.keys(EXAM_REGISTRY).join(', ')}`);
          }
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to load questions.");
        console.error(e);
      } finally {
        setLoading(false);
      }
    };

    loadExamData();
  }, [examId]);

  return { data, examMetadata, error, loading };
}

/**
 * Get list of available exam IDs
 */
export function getAvailableExams(): string[] {
  return Object.keys(EXAM_REGISTRY);
}

/**
 * Check if an exam ID is available in the static registry
 */
export function isExamAvailable(examId: string): examId is AvailableExamId {
  return examId in EXAM_REGISTRY;
}
