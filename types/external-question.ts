// src/types/external-question.ts
export type StudyLink = {
  chunkId: string;
  url?: string;
  anchor?: string;
  excerpt?: string;
};

export type ExternalQuestion = {
  question: string;
  options: { A: string; B: string; C: string; D: string };
  answer: 'A' | 'B' | 'C' | 'D';
  explanation?: string;
  study?: StudyLink[];
};

export type ExternalQuestionsFile = {
  questions: ExternalQuestion[];
};
