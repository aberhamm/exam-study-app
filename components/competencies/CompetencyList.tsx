'use client';

import type { CompetencyWithStats } from '@/app/hooks/useCompetencies';
import { CompetencyCard } from './CompetencyCard';

type CompetencyListProps = {
  competencies: CompetencyWithStats[];
  onUpdate: (
    competencyId: string,
    data: Partial<{ title: string; description: string; examPercentage: number }>
  ) => Promise<import('@/types/competency').CompetencyDocument>;
  onDelete: (competencyId: string) => Promise<void>;
};

export function CompetencyList({ competencies, onUpdate, onDelete }: CompetencyListProps) {
  if (competencies.length === 0) {
    return (
      <div className="text-center py-12 bg-muted/50 rounded-lg border-2 border-dashed border-border">
        <p className="text-muted-foreground">No competencies defined for this exam yet.</p>
        <p className="text-sm text-muted-foreground mt-1">Create your first competency above to get started.</p>
      </div>
    );
  }

  const totalPercentage = competencies.reduce((sum, c) => sum + c.examPercentage, 0);
  const totalQuestions = competencies.reduce((sum, c) => sum + (c.questionCount || 0), 0);

  return (
    <div className="space-y-6">
      {/* Summary Stats */}
      <div className="bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-900 rounded-lg p-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-medium text-blue-900 dark:text-blue-100">Total Coverage</h3>
            <p className="text-2xl font-bold text-blue-700 dark:text-blue-300">{totalPercentage}%</p>
          </div>
          <div>
            <h3 className="text-sm font-medium text-blue-900 dark:text-blue-100">Competencies</h3>
            <p className="text-2xl font-bold text-blue-700 dark:text-blue-300">{competencies.length}</p>
          </div>
          <div>
            <h3 className="text-sm font-medium text-blue-900 dark:text-blue-100">Assigned Questions</h3>
            <p className="text-2xl font-bold text-blue-700 dark:text-blue-300">{totalQuestions}</p>
          </div>
        </div>
        {totalPercentage > 100 && (
          <div className="mt-3 text-sm text-orange-700 dark:text-orange-300 bg-orange-100 dark:bg-orange-950/30 p-2 rounded">
            ⚠ Warning: Total percentage exceeds 100%
          </div>
        )}
        {totalPercentage < 100 && totalPercentage > 0 && (
          <div className="mt-3 text-sm text-blue-700 dark:text-blue-300">
            ℹ Note: Total percentage is {100 - totalPercentage}% below 100%
          </div>
        )}
      </div>

      {/* Competency Cards */}
      <div className="space-y-4">
        {competencies.map((competency) => (
          <CompetencyCard
            key={competency.id}
            competency={competency}
            onUpdate={onUpdate}
            onDelete={onDelete}
          />
        ))}
      </div>
    </div>
  );
}
