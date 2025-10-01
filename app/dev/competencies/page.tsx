'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import type { ExamSummary } from '@/types/api';
import { useCompetencies } from '@/app/hooks/useCompetencies';
import { ExamSelector } from '@/components/competencies/ExamSelector';
import { CompetencyForm } from '@/components/competencies/CompetencyForm';
import { CompetencyList } from '@/components/competencies/CompetencyList';
import { CompetencyListSkeleton } from '@/components/competencies/CompetencySkeleton';

export default function CompetenciesPage() {
  const [exams, setExams] = useState<ExamSummary[]>([]);
  const [selectedExamId, setSelectedExamId] = useState<string | null>(null);
  const [examsLoading, setExamsLoading] = useState(true);
  const [showCreateForm, setShowCreateForm] = useState(false);

  const {
    competencies,
    loading: competenciesLoading,
    error,
    createCompetency,
    updateCompetency,
    deleteCompetency,
    refetch,
  } = useCompetencies(selectedExamId, true);

  useEffect(() => {
    async function fetchExams() {
      try {
        const response = await fetch('/api/exams');
        if (!response.ok) throw new Error('Failed to fetch exams');
        const data = await response.json();
        setExams(data.exams || []);
      } catch (err) {
        console.error('Failed to fetch exams:', err);
      } finally {
        setExamsLoading(false);
      }
    }
    fetchExams();
  }, []);

  const handleCreateCompetency = async (data: {
    title: string;
    description: string;
    examPercentage: number;
  }) => {
    await createCompetency(data);
    setShowCreateForm(false);
  };

  return (
    <div className="container mx-auto px-4 py-8 max-w-6xl">
      <div className="mb-8">
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-3xl font-bold text-foreground">Exam Competencies Manager</h1>
          <Link
            href="/"
            className="px-4 py-2 text-sm bg-secondary text-secondary-foreground rounded-md hover:bg-secondary/80 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
          >
            ← Back to Home
          </Link>
        </div>
        <p className="text-muted-foreground">
          Define and manage competency areas for your exams. Competencies are used to categorize
          questions and ensure balanced coverage across topics.
        </p>
      </div>

      {/* Exam Selector */}
      <ExamSelector
        exams={exams}
        selectedExamId={selectedExamId}
        onSelectExam={setSelectedExamId}
        loading={examsLoading}
      />

      {/* Main Content */}
      {selectedExamId && (
        <div className="space-y-6">
          {/* Actions Bar */}
          <div className="flex items-center justify-between bg-muted/50 p-4 rounded-lg border border-border">
            <div className="text-sm text-muted-foreground">
              {competenciesLoading ? (
                'Loading competencies...'
              ) : (
                <>
                  {competencies.length} competency{competencies.length !== 1 ? 's' : ''} defined
                </>
              )}
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => setShowCreateForm(!showCreateForm)}
                className="px-4 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
              >
                {showCreateForm ? 'Cancel' : '+ New Competency'}
              </button>
              <button
                onClick={refetch}
                disabled={competenciesLoading}
                className="px-4 py-2 bg-secondary text-secondary-foreground rounded-md hover:bg-secondary/80 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Refresh
              </button>
            </div>
          </div>

          {/* Error Display */}
          {error && (
            <div className="p-4 bg-destructive/10 border border-destructive/50 rounded-md text-destructive">
              {error}
            </div>
          )}

          {/* Create Form */}
          {showCreateForm && (
            <div>
              <h2 className="text-xl font-semibold text-foreground mb-4">Create New Competency</h2>
              <CompetencyForm
                onSubmit={handleCreateCompetency}
                onCancel={() => setShowCreateForm(false)}
              />
            </div>
          )}

          {/* Competencies List */}
          <div>
            <h2 className="text-xl font-semibold text-foreground mb-4">Competencies</h2>
            {competenciesLoading ? (
              <CompetencyListSkeleton />
            ) : (
              <CompetencyList
                competencies={competencies}
                onUpdate={updateCompetency}
                onDelete={deleteCompetency}
              />
            )}
          </div>

          {/* Instructions */}
          <div className="mt-8 bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-900 rounded-lg p-6">
            <h3 className="text-lg font-semibold text-blue-900 dark:text-blue-100 mb-3">Next Steps</h3>
            <ol className="space-y-2 text-sm text-blue-800 dark:text-blue-200">
              <li className="flex items-start">
                <span className="font-semibold mr-2">1.</span>
                <span>
                  After creating competencies, run{' '}
                  <code className="bg-blue-100 dark:bg-blue-900/50 px-2 py-0.5 rounded">
                    pnpm embed:competencies --exam {selectedExamId}
                  </code>{' '}
                  to generate embeddings
                </span>
              </li>
              <li className="flex items-start">
                <span className="font-semibold mr-2">2.</span>
                <span>
                  Then run{' '}
                  <code className="bg-blue-100 dark:bg-blue-900/50 px-2 py-0.5 rounded">
                    pnpm assign:competencies --exam {selectedExamId}
                  </code>{' '}
                  to auto-assign competencies to questions
                </span>
              </li>
              <li className="flex items-start">
                <span className="font-semibold mr-2">3.</span>
                <span>Refresh this page to see updated question counts</span>
              </li>
            </ol>
          </div>
        </div>
      )}

      {!selectedExamId && !examsLoading && (
        <div className="text-center py-12 bg-muted/50 rounded-lg border-2 border-dashed border-border">
          <p className="text-muted-foreground">Select an exam to manage its competencies</p>
        </div>
      )}
    </div>
  );
}
