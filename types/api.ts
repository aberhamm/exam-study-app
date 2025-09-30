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
