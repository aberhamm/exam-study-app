'use client';

import type { ExamSummary } from '@/types/api';

type ExamSelectorProps = {
  exams: ExamSummary[];
  selectedExamId: string | null;
  onSelectExam: (examId: string) => void;
  loading?: boolean;
};

export function ExamSelector({ exams, selectedExamId, onSelectExam, loading }: ExamSelectorProps) {
  return (
    <div className="mb-6">
      <label htmlFor="exam-select" className="block text-sm font-medium text-foreground mb-2">
        Select Exam
      </label>
      <select
        id="exam-select"
        value={selectedExamId || ''}
        onChange={(e) => onSelectExam(e.target.value)}
        disabled={loading}
        className="w-full max-w-md px-3 py-2 bg-background border border-input rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-ring focus:border-input disabled:opacity-50 disabled:cursor-not-allowed text-foreground"
      >
        <option value="">-- Select an exam --</option>
        {exams.map((exam) => (
          <option key={exam.examId} value={exam.examId}>
            {exam.examTitle || exam.examId}
          </option>
        ))}
      </select>
    </div>
  );
}
