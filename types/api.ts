// Shared API types for routes and clients
// Keep minimal and focused to avoid cross-module churn

export type ApiSourceRef = {
  url?: string;
  title?: string;
  sourceFile: string;
  sectionPath?: string;
};

export type ExplainTimings = {
  embedQuestionMs?: number;
  searchQuestionMs?: number;
  embedAnswerMs?: number;
  searchAnswerMs?: number;
  mergeMs?: number;
  llmMs?: number;
  totalMs?: number;
};

export type ExplainDebugChunk = {
  title?: string;
  sourceFile: string;
  sourceBasename?: string;
  url?: string;
  sectionPath?: string;
  score: number;
  preview?: string;
  heading?: string;
  groupId?: string;
  tags?: string[];
  chunkIndex?: number;
  chunkTotal?: number;
  description?: string;
};

export type ExplainDebugInfo = {
  questionEmbeddingDim?: number;
  answerEmbeddingDim?: number;
  documentGroups?: string[];
  chunkCounts?: { question: number; answer: number; merged: number; processed: number };
  timings?: ExplainTimings;
  chunks?: ExplainDebugChunk[];
};

export type ExplainResponse = {
  success: boolean;
  explanation: string;
  sources: ApiSourceRef[];
  savedAsDefault?: boolean;
  debug?: ExplainDebugInfo;
};

// Exams list
export type ExamSummary = {
  examId: string;
  examTitle: string;
};

export type ExamsListResponse = {
  exams: ExamSummary[];
};

// Single exam detail response (reuse existing ExamDetail)
import type { ExamDetail } from '@/types/external-question';
export type ExamDetailResponse = ExamDetail;

// Stats response for home/config displays
import type { WelcomeConfig } from '@/types/normalized';
export type ExamStatsResponse = {
  examId: string;
  examTitle?: string;
  welcomeConfig?: WelcomeConfig;
  stats: {
    total: number;
    byType: { single: number; multiple: number };
    byExplanation: { with: number; without: number };
    matrix: {
      single: { with: number; without: number };
      multiple: { with: number; without: number };
    };
  };
};

// Question preparation types
export type PrepareQuestionsRequest = {
  questionType: 'all' | 'single' | 'multiple';
  explanationFilter: 'all' | 'with-explanations' | 'without-explanations';
  questionCount: number;
  competencyFilter?: 'all' | string;
  excludeQuestionIds?: string[];
};

import type { NormalizedQuestion } from '@/types/normalized';
export type PrepareQuestionsResponse = {
  examId: string;
  count: number;
  questions: NormalizedQuestion[];
};
