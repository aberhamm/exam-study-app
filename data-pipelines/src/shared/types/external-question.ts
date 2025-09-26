export type StudyLink = {
  chunkId: string;
  url?: string;
  anchor?: string;
  excerpt?: string;
};

export type ExternalQuestion = {
  question: string;
  options: { A: string; B: string; C: string; D: string };
  answer: 'A' | 'B' | 'C' | 'D' | ('A' | 'B' | 'C' | 'D')[];
  question_type?: 'single' | 'multiple';
  explanation?: string;
  study?: StudyLink[];
};

export type ExternalQuestionsFile = {
  examId?: string;
  examTitle?: string;
  questions: ExternalQuestion[];
};