'use client';

import { useState, useEffect, useCallback } from 'react';
import { use } from 'react';
import Link from 'next/link';
import type { QuestionDocument } from '@/types/question';
import type { CompetencyDocument } from '@/types/competency';
import { QuestionList } from '@/components/questions/QuestionList';
import { QuestionListSkeleton } from '@/components/questions/QuestionListSkeleton';

type PageProps = {
  params: Promise<{ examId: string; competencyId: string }>;
};

type PaginationData = {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
};

export default function CompetencyQuestionsPage({ params }: PageProps) {
  const { examId, competencyId } = use(params);
  const [competency, setCompetency] = useState<CompetencyDocument | null>(null);
  const [questions, setQuestions] = useState<QuestionDocument[]>([]);
  const [pagination, setPagination] = useState<PaginationData | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchQuestions = useCallback(async (page: number) => {
    setLoading(true);
    setError(null);

    try {
      const questionsResponse = await fetch(`/api/exams/${examId}/questions?competencyId=${competencyId}&page=${page}&limit=20`);
      if (!questionsResponse.ok) {
        throw new Error('Failed to fetch questions');
      }
      const questionsData = await questionsResponse.json();
      setQuestions(questionsData.questions || []);
      setPagination(questionsData.pagination);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  }, [examId, competencyId]);

  useEffect(() => {
    async function fetchCompetency() {
      try {
        const competencyResponse = await fetch(`/api/exams/${examId}/competencies/${competencyId}`);
        if (competencyResponse.ok) {
          const competencyData = await competencyResponse.json();
          setCompetency(competencyData.competency);
        }
      } catch (err) {
        console.error('Failed to fetch competency:', err);
      }
    }

    fetchCompetency();
  }, [examId, competencyId]);

  useEffect(() => {
    fetchQuestions(currentPage);
  }, [currentPage, fetchQuestions]);

  if (loading) {
    return (
      <div className="container mx-auto px-4 py-8 max-w-6xl">
        <div className="mb-8">
          <div className="flex items-center gap-2 mb-4">
            <Link
              href="/dev/competencies"
              className="px-4 py-2 text-sm bg-secondary text-secondary-foreground rounded-md hover:bg-secondary/80 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
            >
              ← Back to Competencies
            </Link>
          </div>
          <div className="h-8 bg-muted rounded w-1/2 mb-2 animate-pulse"></div>
          <div className="h-4 bg-muted rounded w-1/4 animate-pulse"></div>
        </div>
        <QuestionListSkeleton count={5} />
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
            href="/dev/competencies"
            className="px-4 py-2 text-sm bg-secondary text-secondary-foreground rounded-md hover:bg-secondary/80 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
          >
            ← Back to Competencies
          </Link>
        </div>
        <h1 className="text-3xl font-bold text-foreground mb-2">
          {competency?.title || 'Competency Questions'}
        </h1>
        <p className="text-muted-foreground">
          {pagination ? `${pagination.total} question${pagination.total !== 1 ? 's' : ''} assigned to this competency` : 'Loading...'}
        </p>
      </div>

      <QuestionList
        questions={questions}
        emptyMessage="No questions assigned to this competency yet."
        pagination={pagination}
        currentPage={currentPage}
        onPageChange={setCurrentPage}
      />
    </div>
  );
}
