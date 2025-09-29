export type QuestionMetrics = {
  seen: number;
  correct: number;
  incorrect: number;
};

export type QuestionMetricsState = Record<string, QuestionMetrics>;
