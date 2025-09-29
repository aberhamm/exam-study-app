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
  study?: StudyLink[];
};

export type ExternalQuestionsFile = {
  examId?: string;
  examTitle?: string;
  welcomeConfig?: WelcomeConfig;
  questions: ExternalQuestion[];
};
