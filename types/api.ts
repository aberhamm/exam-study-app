// src/types/api.ts
import type { ExamDetail } from './external-question';

export type ExamSummary = {
  examId: string;
  examTitle?: string;
};

export type ExamsListResponse = {
  exams: ExamSummary[];
};

export type ExamDetailResponse = ExamDetail;

export type ExamStatsResponse = {
  examId: string;
  examTitle?: string;
  welcomeConfig?: import('./normalized').WelcomeConfig;
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

// Prepare endpoint payloads
export type PrepareQuestionsRequest = {
  questionType: 'all' | 'single' | 'multiple';
  explanationFilter: 'all' | 'with-explanations' | 'without-explanations';
  questionCount: number;
  competencyFilter?: 'all' | string; // 'all' or competency ID
  excludeQuestionIds?: string[]; // Question IDs to exclude (e.g., already seen questions)
};

export type PrepareQuestionsResponse = {
  examId: string;
  count: number;
  questions: import('./normalized').NormalizedQuestion[];
};
