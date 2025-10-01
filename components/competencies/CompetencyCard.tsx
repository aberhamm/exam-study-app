'use client';

import { useState } from 'react';
import type { CompetencyWithStats } from '@/app/hooks/useCompetencies';
import { CompetencyForm } from './CompetencyForm';
import { MarkdownContent } from '@/components/ui/markdown';

type CompetencyCardProps = {
  competency: CompetencyWithStats;
  onUpdate: (
    competencyId: string,
    data: Partial<{ title: string; description: string; examPercentage: number }>
  ) => Promise<void>;
  onDelete: (competencyId: string) => Promise<void>;
};

export function CompetencyCard({ competency, onUpdate, onDelete }: CompetencyCardProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const handleUpdate = async (data: {
    title: string;
    description: string;
    examPercentage: number;
  }) => {
    await onUpdate(competency.id, data);
    setIsEditing(false);
  };

  const handleDelete = async () => {
    if (!confirm(`Are you sure you want to delete "${competency.title}"?`)) {
      return;
    }
    setIsDeleting(true);
    try {
      await onDelete(competency.id);
    } catch (err) {
      setIsDeleting(false);
      alert(err instanceof Error ? err.message : 'Failed to delete competency');
    }
  };

  if (isEditing) {
    return (
      <div className="bg-muted/50 p-4 rounded-lg">
        <h3 className="text-lg font-semibold text-foreground mb-4">Edit Competency</h3>
        <CompetencyForm
          onSubmit={handleUpdate}
          onCancel={() => setIsEditing(false)}
          initialData={competency}
          submitLabel="Update Competency"
        />
      </div>
    );
  }

  return (
    <div className="bg-card p-6 rounded-lg border border-border hover:border-border/80 transition-colors">
      <div className="flex justify-between items-start mb-3">
        <div className="flex-1">
          <h3 className="text-lg font-semibold text-foreground">{competency.title}</h3>
          <div className="flex items-center gap-4 mt-2 text-sm text-muted-foreground">
            <span className="font-medium text-foreground">{competency.examPercentage}% of exam</span>
            {competency.questionCount !== undefined && (
              <span>
                {competency.questionCount} question{competency.questionCount !== 1 ? 's' : ''}
              </span>
            )}
            {competency.embedding && competency.embeddingModel && (
              <span className="text-green-600 dark:text-green-400 text-xs">✓ Embedded</span>
            )}
            {(!competency.embedding || !competency.embeddingModel) && (
              <span className="text-orange-600 dark:text-orange-400 text-xs">⚠ Not embedded</span>
            )}
          </div>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setIsEditing(true)}
            className="px-3 py-1 text-sm text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300 hover:bg-blue-50 dark:hover:bg-blue-950/50 rounded transition-colors"
          >
            Edit
          </button>
          <button
            onClick={handleDelete}
            disabled={isDeleting}
            className="px-3 py-1 text-sm text-red-600 dark:text-red-400 hover:text-red-800 dark:hover:text-red-300 hover:bg-red-50 dark:hover:bg-red-950/50 rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isDeleting ? 'Deleting...' : 'Delete'}
          </button>
        </div>
      </div>

      <div className="text-foreground text-sm leading-relaxed prose prose-sm dark:prose-invert max-w-none">
        <MarkdownContent>{competency.description || ''}</MarkdownContent>
      </div>

      {competency.embeddingUpdatedAt && (
        <p className="mt-3 text-xs text-muted-foreground">
          Embedding updated: {new Date(competency.embeddingUpdatedAt).toLocaleString()}
        </p>
      )}
    </div>
  );
}
