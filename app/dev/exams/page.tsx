'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useHeader } from '@/contexts/HeaderContext';
import { APP_CONFIG } from '@/lib/app-config';
import type { ExamSummary } from '@/types/api';
import type { ExamDetail } from '@/types/external-question';
import { DevNavigation } from '@/components/DevNavigation';

export default function ExamsDevPage() {
  const DEV = APP_CONFIG.DEV_FEATURES_ENABLED;
  const { setConfig, resetConfig } = useHeader();

  const [exams, setExams] = useState<ExamSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedExam, setSelectedExam] = useState<string | null>(null);
  const [examDetails, setExamDetails] = useState<ExamDetail | null>(null);
  const [documentGroups, setDocumentGroups] = useState<string>('');
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState(false);

  useEffect(() => {
    setConfig({
      visible: true,
      variant: 'full',
      leftContent: (
        <Link href="/" className="text-sm text-muted-foreground hover:text-foreground">
          Home
        </Link>
      ),
      rightContent: <DevNavigation currentPage="exams" />,
    });
    return () => resetConfig();
  }, [resetConfig, setConfig]);

  useEffect(() => {
    if (!DEV) return;
    const loadExams = async () => {
      setLoading(true);
      setError(null);
      try {
        const response = await fetch('/api/exams', { cache: 'no-store' });
        if (!response.ok) {
          throw new Error(`Failed to load exams (status ${response.status})`);
        }
        const json = (await response.json()) as { exams: ExamSummary[] };
        setExams(json.exams);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load exams');
      } finally {
        setLoading(false);
      }
    };

    loadExams();
  }, [DEV]);

  useEffect(() => {
    if (!selectedExam) {
      setExamDetails(null);
      setDocumentGroups('');
      return;
    }

    const loadExamDetails = async () => {
      try {
        const response = await fetch(`/api/exams/${encodeURIComponent(selectedExam)}`, {
          cache: 'no-store',
        });
        if (!response.ok) {
          throw new Error(`Failed to load exam details (status ${response.status})`);
        }
        const exam = (await response.json()) as ExamDetail;
        setExamDetails(exam);
        setDocumentGroups((exam.documentGroups || []).join(', '));
      } catch (err) {
        console.error('Failed to load exam details:', err);
      }
    };

    loadExamDetails();
  }, [selectedExam]);

  const handleSave = async () => {
    if (!selectedExam || !examDetails) return;

    setSaving(true);
    setSaveError(null);
    setSaveSuccess(false);

    try {
      const groups = documentGroups
        .split(',')
        .map((g) => g.trim())
        .filter((g) => g.length > 0);

      const response = await fetch(`/api/exams/${encodeURIComponent(selectedExam)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ documentGroups: groups }),
      });

      if (!response.ok) {
        const json = await response.json().catch(() => ({}));
        throw new Error(
          typeof json?.error === 'string' ? json.error : `Save failed (${response.status})`
        );
      }

      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  if (!DEV) {
    return (
      <div className="space-y-6">
        <Card className="p-6">
          <h2 className="text-2xl font-semibold mb-2">Exam Settings Disabled</h2>
          <p className="text-sm text-muted-foreground">
            This tool is available only in development.
          </p>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Card className="p-6">
        <h2 className="text-2xl font-semibold mb-2">Exam Settings (Dev)</h2>
        <p className="text-sm text-muted-foreground mb-6">
          Configure exam settings including document groups for AI-generated explanations.
        </p>

        {error && (
          <div className="mb-4 rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
            {error}
          </div>
        )}

        <div className="space-y-4">
          <div className="space-y-2">
            <label className="text-sm font-medium" htmlFor="exam-select">
              Select Exam
            </label>
            <select
              id="exam-select"
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              value={selectedExam || ''}
              onChange={(e) => setSelectedExam(e.target.value || null)}
              disabled={loading}
            >
              <option value="">{loading ? 'Loading exams…' : 'Select an exam…'}</option>
              {exams.map((exam) => (
                <option key={exam.examId} value={exam.examId}>
                  {exam.examTitle ? `${exam.examTitle} (${exam.examId})` : exam.examId}
                </option>
              ))}
            </select>
          </div>

          {selectedExam && examDetails && (
            <>
              <div className="space-y-2">
                <label className="text-sm font-medium" htmlFor="document-groups">
                  Document Groups
                </label>
                <p className="text-xs text-muted-foreground">
                  Comma-separated list of document groupIds to use for generating explanations.
                  Leave empty to search all documents.
                </p>
                <input
                  id="document-groups"
                  type="text"
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                  placeholder="e.g., sitecore-xmc, sitecore-docs, official-docs"
                  value={documentGroups}
                  onChange={(e) => setDocumentGroups(e.target.value)}
                />
              </div>

              {saveError && (
                <div className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
                  {saveError}
                </div>
              )}

              {saveSuccess && (
                <div className="rounded-md border border-green-600/40 bg-green-50 p-3 text-sm text-green-700">
                  Settings saved successfully!
                </div>
              )}

              <div className="flex gap-3">
                <Button onClick={handleSave} disabled={saving}>
                  {saving ? 'Saving…' : 'Save Settings'}
                </Button>
              </div>
            </>
          )}
        </div>
      </Card>

      {selectedExam && examDetails && (
        <Card className="p-6">
          <h3 className="text-xl font-semibold mb-2">Current Settings</h3>
          <div className="space-y-2 text-sm">
            <div>
              <span className="font-medium">Exam ID:</span>{' '}
              <span className="font-mono">{examDetails.examId}</span>
            </div>
            <div>
              <span className="font-medium">Exam Title:</span> {examDetails.examTitle || 'N/A'}
            </div>
            <div>
              <span className="font-medium">Total Questions:</span> {examDetails.questions.length}
            </div>
            <div>
              <span className="font-medium">Document Groups:</span>{' '}
              {examDetails.documentGroups && examDetails.documentGroups.length > 0 ? (
                <div className="mt-1 flex gap-2 flex-wrap">
                  {examDetails.documentGroups.map((group) => (
                    <span key={group} className="text-xs bg-muted px-2 py-1 rounded font-mono">
                      {group}
                    </span>
                  ))}
                </div>
              ) : (
                <span className="text-muted-foreground">All documents (no filter)</span>
              )}
            </div>
          </div>
        </Card>
      )}
    </div>
  );
}
