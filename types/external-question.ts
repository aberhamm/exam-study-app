// src/types/external-question.ts
import type { WelcomeConfig } from './normalized';
import type { ExplanationSource } from './explanation';

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
  explanationSources?: ExplanationSource[];
  study?: StudyLink[];
  competencyIds?: string[];
  competencies?: Array<{ id: string; title: string }>;
  flaggedForReview?: boolean;
  flaggedReason?: string;
  flaggedAt?: Date;
  flaggedBy?: string;
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
  documentGroups?: string[];
  questions: ExternalQuestion[];
};

/**
 * @deprecated Use ExamDetail instead. Kept temporarily for intra-repo compatibility.
 */
export type ExternalQuestionsFile = ExamDetail;
