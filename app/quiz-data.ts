// src/app/quiz-data.ts
import raw from '@/data/exams/sitecore-xmc.json';
import { ExternalQuestionsFileZ } from '@/lib/validation';
import { normalizeQuestions } from '@/lib/normalize';

const parsed = ExternalQuestionsFileZ.parse(raw);
export const QUESTIONS = normalizeQuestions(parsed.questions);
