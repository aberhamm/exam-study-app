'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Search, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import SpinnerButton from '@/components/ui/SpinnerButton';
import type { QuestionDocument } from '@/types/question';
import { QuestionList } from '@/components/questions/QuestionList';
import { QuestionListSkeleton } from '@/components/questions/QuestionListSkeleton';

type ExamSummary = {
  examId: string;
  examTitle: string;
  questionCount: number;
};

type PaginationData = {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
};

type SearchResult = {
  score: number;
  question: QuestionDocument & { id: string };
};

type QuestionsPageClientProps = {
  examId: string;
  examTitle: string;
  exams: ExamSummary[];
};

export function QuestionsPageClient({ examId, examTitle, exams }: QuestionsPageClientProps) {
  const router = useRouter();
  const [questions, setQuestions] = useState<(QuestionDocument & { id: string })[]>([]);
  const [pagination, setPagination] = useState<PaginationData | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [questionsLoading, setQuestionsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showFlaggedOnly, setShowFlaggedOnly] = useState(false);

  // Search state
  const [searchMode, setSearchMode] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);

  const fetchQuestions = useCallback(async (page: number, flaggedOnly: boolean) => {
    setQuestionsLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams({
        page: page.toString(),
        limit: '20',
      });
      if (flaggedOnly) {
        params.set('flaggedOnly', 'true');
      }
      const questionsResponse = await fetch(`/api/exams/${examId}/questions?${params.toString()}`);
      if (!questionsResponse.ok) {
        throw new Error('Failed to fetch questions');
      }
      const questionsData = await questionsResponse.json();
      setQuestions(questionsData.questions || []);
      setPagination(questionsData.pagination);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setQuestionsLoading(false);
    }
  }, [examId]);

  const handleSearch = useCallback(async (query: string) => {
    if (!query.trim()) {
      // Clear search mode if query is empty
      setSearchMode(false);
      setSearchResults([]);
      setSearchError(null);
      return;
    }

    setSearching(true);
    setSearchError(null);
    setSearchMode(true);

    try {
      const response = await fetch(`/api/exams/${examId}/search`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query, topK: 50 }),
      });

      if (!response.ok) {
        const json = await response.json().catch(() => ({}));
        throw new Error(
          typeof json?.error === 'string' ? json.error : `Search failed (${response.status})`
        );
      }

      const data = await response.json();
      const results = Array.isArray(data?.results) ? (data.results as SearchResult[]) : [];
      setSearchResults(results);
    } catch (err) {
      setSearchError(err instanceof Error ? err.message : 'Search failed');
      setSearchResults([]);
    } finally {
      setSearching(false);
    }
  }, [examId]);

  const clearSearch = useCallback(() => {
    setSearchMode(false);
    setSearchQuery('');
    setSearchResults([]);
    setSearchError(null);
  }, []);

  useEffect(() => {
    if (!searchMode) {
      fetchQuestions(currentPage, showFlaggedOnly);
    }
  }, [currentPage, showFlaggedOnly, searchMode, fetchQuestions]);

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

  // Get the questions to display based on mode
  const displayQuestions = searchMode
    ? searchResults.map(r => r.question)
    : questions;

  const resultCount = searchMode
    ? searchResults.length
    : (pagination ? pagination.total : 0);

  return (
    <div className="container mx-auto px-4 py-8 max-w-6xl">
      <div className="mb-8">
        <div className="flex items-center justify-between gap-4 mb-4">
          <Link
            href="/"
            className="px-4 py-2 text-sm bg-secondary text-secondary-foreground rounded-md hover:bg-secondary/80 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
          >
            ← Back to Home
          </Link>

          {exams.length > 0 && (
            <div className="flex items-center gap-2">
              <label htmlFor="exam-selector" className="text-sm font-medium text-foreground">
                Exam:
              </label>
              <select
                id="exam-selector"
                value={examId}
                onChange={(e) => router.push(`/admin/questions/${e.target.value}`)}
                className="px-3 py-2 text-sm rounded-md border border-input bg-background focus:outline-none focus:ring-2 focus:ring-ring"
              >
                {exams.map((exam) => (
                  <option key={exam.examId} value={exam.examId}>
                    {exam.examTitle} ({exam.questionCount} questions)
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>

        <div className="mb-6">
          <h1 className="text-3xl font-bold text-foreground mb-4">
            All Questions - {examTitle}
          </h1>

          {/* Search Bar */}
          <div className="flex items-center gap-2">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <input
                type="text"
                placeholder="Search questions using semantic search..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    handleSearch(searchQuery);
                  }
                }}
                className="w-full pl-10 pr-4 py-2 rounded-md border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
            <SpinnerButton
              onClick={() => handleSearch(searchQuery)}
              disabled={!searchQuery.trim()}
              loading={searching}
              loadingText="Searching..."
            >
              Search
            </SpinnerButton>
            {searchMode && (
              <Button variant="outline" onClick={clearSearch}>
                <X className="h-4 w-4 mr-1" />
                Clear
              </Button>
            )}
          </div>

          {searchError && (
            <div className="mt-3 rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
              {searchError}
            </div>
          )}
        </div>

        <div className="flex items-center justify-between mb-4">
          <div>
            <p className="text-muted-foreground">
              {searchMode ? (
                <>
                  Found {resultCount} question{resultCount !== 1 ? 's' : ''} matching &quot;{searchQuery}&quot;
                </>
              ) : (
                <>
                  {pagination ? `${pagination.total} question${pagination.total !== 1 ? 's' : ''} ${showFlaggedOnly ? 'flagged' : 'available'}` : 'Loading...'}
                </>
              )}
            </p>
          </div>
          {!searchMode && (
            <div className="flex items-center gap-2">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={showFlaggedOnly}
                  onChange={(e) => {
                    setShowFlaggedOnly(e.target.checked);
                    setCurrentPage(1);
                  }}
                  className="w-4 h-4 rounded border-gray-300 text-orange-600 focus:ring-orange-500 focus:ring-offset-2 cursor-pointer"
                />
                <span className="text-sm font-medium text-foreground">Show flagged only</span>
              </label>
            </div>
          )}
        </div>
      </div>

      {searching || questionsLoading ? (
        <QuestionListSkeleton count={5} />
      ) : (
        <QuestionList
          questions={displayQuestions}
          emptyMessage={
            searchMode
              ? `No questions found matching "${searchQuery}".`
              : (showFlaggedOnly ? 'No flagged questions found.' : 'No questions found for this exam.')
          }
          showCompetencies={true}
          examId={examId}
          pagination={searchMode ? null : pagination}
          currentPage={currentPage}
          onPageChange={setCurrentPage}
        />
      )}
    </div>
  );
}
