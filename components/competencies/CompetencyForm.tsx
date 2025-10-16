'use client';

import { useState } from 'react';
import SpinnerButton from '@/components/ui/SpinnerButton';
import { Button } from '@/components/ui/button';
import type { CompetencyDocument } from '@/types/competency';

type CompetencyFormProps = {
  onSubmit: (data: { title: string; description: string; examPercentage: number }) => Promise<void>;
  onCancel: () => void;
  initialData?: CompetencyDocument;
  submitLabel?: string;
};

export function CompetencyForm({
  onSubmit,
  onCancel,
  initialData,
  submitLabel = 'Create Competency',
}: CompetencyFormProps) {
  const [title, setTitle] = useState(initialData?.title || '');
  const [description, setDescription] = useState(initialData?.description || '');
  const [examPercentage, setExamPercentage] = useState(initialData?.examPercentage || 0);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);

    try {
      await onSubmit({ title, description, examPercentage });
      // Reset form if creating new
      if (!initialData) {
        setTitle('');
        setDescription('');
        setExamPercentage(0);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to submit');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4 bg-card p-6 rounded-lg border border-border">
      {error && (
        <div className="p-3 bg-destructive/10 border border-destructive/50 rounded-md text-destructive text-sm">
          {error}
        </div>
      )}

      <div>
        <label htmlFor="title" className="block text-sm font-medium text-foreground mb-1">
          Title *
        </label>
        <input
          id="title"
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          required
          maxLength={200}
          className="w-full px-3 py-2 bg-background border border-input rounded-md focus:outline-none focus:ring-2 focus:ring-ring text-foreground"
          placeholder="e.g., Content Management"
        />
      </div>

      <div>
        <label htmlFor="description" className="block text-sm font-medium text-foreground mb-1">
          Description *
        </label>
        <textarea
          id="description"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          required
          rows={4}
          className="w-full px-3 py-2 bg-background border border-input rounded-md focus:outline-none focus:ring-2 focus:ring-ring text-foreground"
          placeholder="Describe what this competency covers..."
        />
      </div>

      <div>
        <label htmlFor="examPercentage" className="block text-sm font-medium text-foreground mb-1">
          Exam Percentage (%) *
        </label>
        <input
          id="examPercentage"
          type="number"
          value={examPercentage}
          onChange={(e) => setExamPercentage(Number(e.target.value))}
          required
          min={0}
          max={100}
          step={1}
          className="w-full px-3 py-2 bg-background border border-input rounded-md focus:outline-none focus:ring-2 focus:ring-ring text-foreground"
        />
        <p className="mt-1 text-xs text-muted-foreground">
          Target percentage of exam questions for this competency (0-100)
        </p>
      </div>

      <div className="flex gap-3 pt-2">
        <SpinnerButton
          type="submit"
          disabled={!title || !description}
          loading={submitting}
          loadingText="Saving..."
        >
          {submitLabel}
        </SpinnerButton>
        <Button
          type="button"
          onClick={onCancel}
          disabled={submitting}
          variant="secondary"
        >
          Cancel
        </Button>
      </div>
    </form>
  );
}
