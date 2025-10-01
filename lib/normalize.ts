// src/lib/normalize.ts
import type { ExternalQuestion } from '@/types/external-question';
import type { NormalizedQuestion } from '@/types/normalized';

const LETTER_TO_INDEX = { A: 0, B: 1, C: 2, D: 3, E: 4 } as const;
const INDEX_TO_LETTER = ['A', 'B', 'C', 'D', 'E'] as const;

// small, deterministic id from question+answer (good enough for client use)
function hashId(input: string): string {
  let h = 5381;
  for (let i = 0; i < input.length; i++) h = (h * 33) ^ input.charCodeAt(i);
  return 'q-' + (h >>> 0).toString(36);
}

export function generateQuestionId(question: ExternalQuestion): string {
  if (question.id && question.id.trim().length > 0) {
    return question.id;
  }
  const questionType = question.question_type || 'single';
  const answerString = Array.isArray(question.answer) ? question.answer.join('|') : question.answer;
  return hashId(question.question + '|' + answerString + '|' + questionType);
}

export function normalizeQuestions(qs: ExternalQuestion[]): NormalizedQuestion[] {
  return qs.map((q) => {
    const questionType = q.question_type || 'single';
    const id = generateQuestionId(q);

    const answerIndex = Array.isArray(q.answer)
      ? q.answer.map(letter => LETTER_TO_INDEX[letter])
      : LETTER_TO_INDEX[q.answer];

    const choices = q.options.E
      ? [q.options.A, q.options.B, q.options.C, q.options.D, q.options.E]
      : [q.options.A, q.options.B, q.options.C, q.options.D];

    return {
      id,
      prompt: q.question,
      choices,
      answerIndex,
      questionType,
      explanation: q.explanation,
      explanationGeneratedByAI: q.explanationGeneratedByAI,
      study: q.study,
      competencyIds: q.competencyIds,
    } as NormalizedQuestion;
  });
}

export function denormalizeQuestion(question: NormalizedQuestion): ExternalQuestion & { id: string } {
  const options: ExternalQuestion['options'] = {
    A: question.choices[0],
    B: question.choices[1],
    C: question.choices[2],
    D: question.choices[3],
  };

  if (question.choices[4]) {
    options.E = question.choices[4];
  }

  const answer = Array.isArray(question.answerIndex)
    ? question.answerIndex.map((idx) => INDEX_TO_LETTER[idx])
    : INDEX_TO_LETTER[question.answerIndex];

  return {
    id: question.id,
    question: question.prompt,
    options,
    answer: answer as ExternalQuestion['answer'],
    question_type: question.questionType,
    explanation: question.explanation,
    explanationGeneratedByAI: question.explanationGeneratedByAI,
    study: question.study,
    competencyIds: question.competencyIds,
  };
}
