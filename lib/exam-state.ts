import type { NormalizedQuestion } from '@/types/normalized';
import type { TestSettings } from '@/lib/test-settings';

export type ExamState = {
  id: string;
  examId?: string;
  examTitle?: string;
  startTime: number;
  currentQuestionIndex: number;
  selectedAnswers: (number | number[] | null)[];
  showResult: boolean;
  showFeedback: boolean;
  score: number;
  incorrectAnswers: Array<{
    question: NormalizedQuestion;
    selectedIndex: number | number[];
    correctIndex: number | number[];
  }>;
  timerRunning: boolean;
  timeElapsed: number; // in seconds
  questions: NormalizedQuestion[];
  testSettings: TestSettings;
  lastUpdated: number;
};

const EXAM_STATE_KEY = 'scxmcl-exam-state';
const EXAM_EXPIRY_HOURS = 24; // Exams expire after 24 hours

export function saveExamState(state: ExamState): void {
  if (typeof window === 'undefined') return;

  try {
    const stateToSave = {
      ...state,
      lastUpdated: Date.now()
    };
    localStorage.setItem(EXAM_STATE_KEY, JSON.stringify(stateToSave));
  } catch (error) {
    console.warn('Failed to save exam state:', error);
  }
}

export function loadExamState(): ExamState | null {
  if (typeof window === 'undefined') return null;

  try {
    const saved = localStorage.getItem(EXAM_STATE_KEY);
    if (!saved) return null;

    const state: ExamState = JSON.parse(saved);

    // Check if exam has expired
    const now = Date.now();
    const expiryTime = state.lastUpdated + (EXAM_EXPIRY_HOURS * 60 * 60 * 1000);

    if (now > expiryTime) {
      clearExamState();
      return null;
    }

    return state;
  } catch (error) {
    console.warn('Failed to load exam state:', error);
    clearExamState();
    return null;
  }
}

export function clearExamState(): void {
  if (typeof window === 'undefined') return;

  try {
    localStorage.removeItem(EXAM_STATE_KEY);
  } catch (error) {
    console.warn('Failed to clear exam state:', error);
  }
}

export function hasActiveExam(): boolean {
  const state = loadExamState();
  return state !== null && !state.showResult;
}

export function createExamState(
  questions: NormalizedQuestion[],
  testSettings: TestSettings,
  examId?: string,
  examTitle?: string
): ExamState {
  const now = Date.now();
  return {
    id: `exam-${now}`,
    examId,
    examTitle,
    startTime: now,
    currentQuestionIndex: 0,
    selectedAnswers: [],
    showResult: false,
    showFeedback: false,
    score: 0,
    incorrectAnswers: [],
    timerRunning: true,
    timeElapsed: 0,
    questions,
    testSettings,
    lastUpdated: now
  };
}

export function updateExamState(currentState: ExamState, updates: Partial<ExamState>): ExamState {
  return {
    ...currentState,
    ...updates,
    lastUpdated: Date.now()
  };
}

export function isExamStateValid(state: ExamState | null): boolean {
  if (!state) return false;

  return (
    state.questions &&
    state.questions.length > 0 &&
    state.testSettings &&
    typeof state.currentQuestionIndex === 'number' &&
    state.currentQuestionIndex >= 0 &&
    state.currentQuestionIndex < state.questions.length &&
    Array.isArray(state.selectedAnswers)
  );
}
