// src/types/api.ts
import type { ExternalQuestionsFile } from './external-question';

export type ExamSummary = {
  examId: string;
  examTitle?: string;
};

export type ExamsListResponse = {
  exams: ExamSummary[];
};

export type ExamDetailResponse = ExternalQuestionsFile;
