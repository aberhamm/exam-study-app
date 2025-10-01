'use client';

import { useState, useEffect, useCallback } from 'react';
import type { CompetencyDocument } from '@/types/competency';

export type CompetencyWithStats = CompetencyDocument & {
  questionCount?: number;
};

export type UseCompetenciesResult = {
  competencies: CompetencyWithStats[];
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
  createCompetency: (data: {
    title: string;
    description: string;
    examPercentage: number;
  }) => Promise<CompetencyDocument>;
  updateCompetency: (
    competencyId: string,
    data: Partial<{ title: string; description: string; examPercentage: number }>
  ) => Promise<CompetencyDocument>;
  deleteCompetency: (competencyId: string) => Promise<void>;
};

export function useCompetencies(
  examId: string | null,
  includeStats: boolean = false
): UseCompetenciesResult {
  const [competencies, setCompetencies] = useState<CompetencyWithStats[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchCompetencies = useCallback(async () => {
    if (!examId) {
      setCompetencies([]);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams();
      if (includeStats) params.set('includeStats', 'true');

      const response = await fetch(`/api/exams/${examId}/competencies?${params.toString()}`);

      if (!response.ok) {
        throw new Error('Failed to fetch competencies');
      }

      const data = await response.json();
      setCompetencies(data.competencies || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
      setCompetencies([]);
    } finally {
      setLoading(false);
    }
  }, [examId, includeStats]);

  useEffect(() => {
    fetchCompetencies();
  }, [fetchCompetencies]);

  const createCompetency = async (data: {
    title: string;
    description: string;
    examPercentage: number;
  }): Promise<CompetencyDocument> => {
    if (!examId) {
      throw new Error('No exam selected');
    }

    const response = await fetch(`/api/exams/${examId}/competencies`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error || 'Failed to create competency');
    }

    const result = await response.json();
    await fetchCompetencies(); // Refetch to update list
    return result.competency;
  };

  const updateCompetency = async (
    competencyId: string,
    data: Partial<{ title: string; description: string; examPercentage: number }>
  ): Promise<CompetencyDocument> => {
    if (!examId) {
      throw new Error('No exam selected');
    }

    const response = await fetch(`/api/exams/${examId}/competencies/${competencyId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error || 'Failed to update competency');
    }

    const result = await response.json();

    // Optimistically update the local state
    setCompetencies((prev) =>
      prev.map((comp) =>
        comp.id === competencyId ? { ...comp, ...result.competency } : comp
      )
    );

    return result.competency;
  };

  const deleteCompetency = async (competencyId: string): Promise<void> => {
    if (!examId) {
      throw new Error('No exam selected');
    }

    const response = await fetch(`/api/exams/${examId}/competencies/${competencyId}`, {
      method: 'DELETE',
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error || 'Failed to delete competency');
    }

    // Optimistically update the local state
    setCompetencies((prev) => prev.filter((comp) => comp.id !== competencyId));
  };

  return {
    competencies,
    loading,
    error,
    refetch: fetchCompetencies,
    createCompetency,
    updateCompetency,
    deleteCompetency,
  };
}
