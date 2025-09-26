import type { NormalizedQuestion } from "@/types/normalized";
import type { TestSettings, QuestionTypeFilter, ExplanationFilter } from "@/lib/test-settings";

/**
 * Filter questions based on question type
 */
export function filterQuestionsByType(
  questions: NormalizedQuestion[],
  questionType: QuestionTypeFilter
): NormalizedQuestion[] {
  if (questionType === 'all') {
    return questions;
  }

  return questions.filter(question => question.questionType === questionType);
}

/**
 * Filter questions based on explanation availability
 */
export function filterQuestionsByExplanation(
  questions: NormalizedQuestion[],
  explanationFilter: ExplanationFilter
): NormalizedQuestion[] {
  if (explanationFilter === 'all') {
    return questions;
  }

  if (explanationFilter === 'with-explanations') {
    return questions.filter(question => question.explanation && question.explanation.trim().length > 0);
  }

  if (explanationFilter === 'without-explanations') {
    return questions.filter(question => !question.explanation || question.explanation.trim().length === 0);
  }

  return questions;
}

/**
 * Limit the number of questions to the specified count
 */
export function limitQuestions(
  questions: NormalizedQuestion[],
  count: number
): NormalizedQuestion[] {
  return questions.slice(0, count);
}

/**
 * Prepare questions based on test settings
 * Filters by type, explanation availability, shuffles, and limits to the specified count
 */
export function prepareQuestionsForTest(
  questions: NormalizedQuestion[],
  settings: TestSettings
): NormalizedQuestion[] {
  // Filter by question type
  let filtered = filterQuestionsByType(questions, settings.questionType);

  // Filter by explanation availability
  filtered = filterQuestionsByExplanation(filtered, settings.explanationFilter);

  // Shuffle the filtered questions
  const shuffled = shuffleArray(filtered);

  // Limit to the specified count
  return limitQuestions(shuffled, settings.questionCount);
}

/**
 * Fisher-Yates shuffle algorithm
 */
export function shuffleArray<T>(array: T[]): T[] {
  const shuffled = [...array];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

/**
 * Get question counts by type and explanation availability
 */
export function getQuestionCounts(questions: NormalizedQuestion[]) {
  const withExplanations = questions.filter(q => q.explanation && q.explanation.trim().length > 0);
  const withoutExplanations = questions.filter(q => !q.explanation || q.explanation.trim().length === 0);

  return {
    all: questions.length,
    single: questions.filter(q => q.questionType === 'single').length,
    multiple: questions.filter(q => q.questionType === 'multiple').length,
    'with-explanations': withExplanations.length,
    'without-explanations': withoutExplanations.length
  };
}

/**
 * Get question counts by type for a specific explanation filter
 */
export function getQuestionCountsByTypeAndExplanation(
  questions: NormalizedQuestion[],
  explanationFilter: ExplanationFilter
) {
  const filtered = filterQuestionsByExplanation(questions, explanationFilter);
  return {
    all: filtered.length,
    single: filtered.filter(q => q.questionType === 'single').length,
    multiple: filtered.filter(q => q.questionType === 'multiple').length
  };
}

/**
 * Validate if test settings are possible with available questions
 */
export function validateTestConfiguration(
  questions: NormalizedQuestion[],
  settings: TestSettings
): { valid: boolean; message?: string } {
  const counts = getQuestionCounts(questions);
  const availableForType = counts[settings.questionType];

  if (availableForType === 0) {
    return {
      valid: false,
      message: `No questions available for type: ${settings.questionType}`
    };
  }

  if (settings.questionCount > availableForType) {
    return {
      valid: false,
      message: `Requested ${settings.questionCount} questions but only ${availableForType} available for type: ${settings.questionType}`
    };
  }

  return { valid: true };
}