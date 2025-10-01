// src/types/external-question.ts
import type { WelcomeConfig } from './normalized';

export type StudyLink = {
  chunkId: string;
  url?: string;
  anchor?: string;
  excerpt?: string;
};

export type ExternalQuestion = {
  id?: string;
  question: string;
  options: { A: string; B: string; C: string; D: string; E?: string };
  answer: 'A' | 'B' | 'C' | 'D' | 'E' | ('A' | 'B' | 'C' | 'D' | 'E')[];
  question_type?: 'single' | 'multiple';
  explanation?: string;
  explanationGeneratedByAI?: boolean;
  study?: StudyLink[];
  competencyIds?: string[];
};

/**
 * ExamDetail
 * In-memory payload shape used by the app/API for an exam with its questions.
 * Originated from pipeline JSON, but not a literal file in the app.
 */
export type ExamDetail = {
  examId?: string;
  examTitle?: string;
  welcomeConfig?: WelcomeConfig;
  questions: ExternalQuestion[];
};

/**
 * @deprecated Use ExamDetail instead. Kept temporarily for intra-repo compatibility.
 */
export type ExternalQuestionsFile = ExamDetail;
