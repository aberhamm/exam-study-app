'use client';

import { useState, useEffect } from 'react';
import { use } from 'react';
import Link from 'next/link';
import type { QuestionDocument } from '@/types/question';
import { QuestionList } from '@/components/questions/QuestionList';

type PageProps = {
  params: Promise<{ examId: string }>;
};

export default function AllQuestionsPage({ params }: PageProps) {
  const { examId } = use(params);
  const [questions, setQuestions] = useState<QuestionDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [examTitle, setExamTitle] = useState<string>('');

  useEffect(() => {
    async function fetchData() {
      setLoading(true);
      setError(null);

      try {
        // Fetch exam details
        const examResponse = await fetch(`/api/exams/${examId}`);
        if (examResponse.ok) {
          const examData = await examResponse.json();
          setExamTitle(examData.examTitle || 'Exam');
        }

        // Fetch all questions for this exam
        const questionsResponse = await fetch(`/api/exams/${examId}/questions`);
        if (!questionsResponse.ok) {
          throw new Error('Failed to fetch questions');
        }
        const questionsData = await questionsResponse.json();
        setQuestions(questionsData.questions || []);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Unknown error');
      } finally {
        setLoading(false);
      }
    }

    fetchData();
  }, [examId]);

  if (loading) {
    return (
      <div className="container mx-auto px-4 py-8 max-w-6xl">
        <div className="text-center py-20">
          <div className="text-lg">Loading questions...</div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="container mx-auto px-4 py-8 max-w-6xl">
        <div className="text-center py-20">
          <div className="text-red-600 dark:text-red-400">
            <h2 className="text-xl font-semibold mb-2">Error</h2>
            <p>{error}</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8 max-w-6xl">
      <div className="mb-8">
        <div className="flex items-center gap-2 mb-4">
          <Link
            href="/"
            className="px-4 py-2 text-sm bg-secondary text-secondary-foreground rounded-md hover:bg-secondary/80 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
          >
            ← Back to Home
          </Link>
        </div>
        <h1 className="text-3xl font-bold text-foreground mb-2">
          All Questions {examTitle && `- ${examTitle}`}
        </h1>
        <p className="text-muted-foreground">
          {questions.length} question{questions.length !== 1 ? 's' : ''} available
        </p>
      </div>

      <QuestionList
        questions={questions}
        emptyMessage="No questions found for this exam."
      />
    </div>
  );
}
