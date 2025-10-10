import type { StudyLink } from './external-question';

export type QuestionDocument = {
  // Note: MongoDB _id is the primary identifier, mapped to 'id' in external API responses
  examId: string;
  question: string;
  options: { A: string; B: string; C: string; D: string; E?: string };
  answer: 'A' | 'B' | 'C' | 'D' | 'E' | ('A' | 'B' | 'C' | 'D' | 'E')[];
  question_type?: 'single' | 'multiple';
  explanation?: string;
  explanationGeneratedByAI?: boolean;
  study?: StudyLink[];
  competencyIds?: string[];
  createdAt: Date;
  updatedAt: Date;
  embedding?: number[];
  embeddingModel?: string;
  embeddingUpdatedAt?: Date;
};

export type QuestionWithId = QuestionDocument;

