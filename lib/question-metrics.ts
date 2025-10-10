import type { QuestionMetrics, QuestionMetricsState } from '@/types/question-metrics';

const STORAGE_KEY = 'scxmcl-question-metrics';

type MetricsUpdate = {
  questionId: string;
  seenIncrement?: number;
  correctIncrement?: number;
  incorrectIncrement?: number;
};

function isBrowser(): boolean {
  return typeof window !== 'undefined' && typeof window.localStorage !== 'undefined';
}

function readState(): QuestionMetricsState {
  if (!isBrowser()) {
    return {};
  }

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as QuestionMetricsState;
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch (error) {
    console.warn('Failed to read question metrics from storage', error);
    return {};
  }
}

function writeState(state: QuestionMetricsState): void {
  if (!isBrowser()) {
    return;
  }

  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch (error) {
    console.warn('Failed to write question metrics to storage', error);
  }
}

function ensureMetrics(state: QuestionMetricsState, questionId: string): QuestionMetrics {
  if (!state[questionId]) {
    state[questionId] = { seen: 0, correct: 0, incorrect: 0 };
  }
  return state[questionId];
}

function applyUpdate(update: MetricsUpdate): QuestionMetrics {
  const state = readState();
  const metrics = ensureMetrics(state, update.questionId);

  if (update.seenIncrement) {
    metrics.seen += update.seenIncrement;
  }
  if (update.correctIncrement) {
    metrics.correct += update.correctIncrement;
  }
  if (update.incorrectIncrement) {
    metrics.incorrect += update.incorrectIncrement;
  }

  writeState(state);
  return metrics;
}

export function recordQuestionSeen(questionId: string): QuestionMetrics {
  return applyUpdate({ questionId, seenIncrement: 1 });
}

export function recordQuestionResult(questionId: string, result: 'correct' | 'incorrect'): QuestionMetrics {
  return applyUpdate({
    questionId,
    correctIncrement: result === 'correct' ? 1 : 0,
    incorrectIncrement: result === 'incorrect' ? 1 : 0,
  });
}

export function getQuestionMetrics(questionId: string): QuestionMetrics {
  const state = readState();
  return ensureMetrics(state, questionId);
}

export function getAllQuestionMetrics(): QuestionMetricsState {
  return readState();
}

export function resetQuestionMetrics(questionId?: string): void {
  if (!isBrowser()) return;

  if (!questionId) {
    try {
      window.localStorage.removeItem(STORAGE_KEY);
    } catch (error) {
      console.warn('Failed to reset question metrics', error);
    }
    return;
  }

  const state = readState();
  if (state[questionId]) {
    delete state[questionId];
    writeState(state);
  }
}

export function getMissedQuestionIds(minIncorrect: number = 1): string[] {
  const state = readState();
  return Object.entries(state)
    .filter(([, metrics]) => metrics.incorrect >= minIncorrect)
    .map(([questionId]) => questionId);
}
