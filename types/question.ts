import type { StudyLink } from './external-question';

export type QuestionDocument = {
  id: string;
  examId: string;
  question: string;
  options: { A: string; B: string; C: string; D: string; E?: string };
  answer: 'A' | 'B' | 'C' | 'D' | 'E' | ('A' | 'B' | 'C' | 'D' | 'E')[];
  question_type?: 'single' | 'multiple';
  explanation?: string;
  study?: StudyLink[];
  createdAt: Date;
  updatedAt: Date;
  embedding?: number[];
  embeddingModel?: string;
  embeddingUpdatedAt?: Date;
};

export type QuestionWithId = QuestionDocument;

