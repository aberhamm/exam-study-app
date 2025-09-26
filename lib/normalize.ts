// src/lib/normalize.ts
import type { ExternalQuestion } from '@/types/external-question';
import type { NormalizedQuestion } from '@/types/normalized';

const LETTER_TO_INDEX = { A: 0, B: 1, C: 2, D: 3 } as const;

// small, deterministic id from question+answer (good enough for client use)
function hashId(input: string): string {
  let h = 5381;
  for (let i = 0; i < input.length; i++) h = (h * 33) ^ input.charCodeAt(i);
  return 'q-' + (h >>> 0).toString(36);
}

export function normalizeQuestions(qs: ExternalQuestion[]): NormalizedQuestion[] {
  return qs.map((q) => {
    const questionType = q.question_type || 'single';
    const answerString = Array.isArray(q.answer) ? q.answer.join('|') : q.answer;
    const id = hashId(q.question + '|' + answerString + '|' + questionType);

    const answerIndex = Array.isArray(q.answer)
      ? q.answer.map(letter => LETTER_TO_INDEX[letter])
      : LETTER_TO_INDEX[q.answer];

    return {
      id,
      prompt: q.question,
      choices: [q.options.A, q.options.B, q.options.C, q.options.D],
      answerIndex,
      questionType,
      explanation: q.explanation,
      study: q.study,
    } as NormalizedQuestion;
  });
}
