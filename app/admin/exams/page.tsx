'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Card } from '@/components/ui/card';
// import { Button } from '@/components/ui/button';
import { useHeader } from '@/contexts/HeaderContext';
import type { ExamSummary } from '@/types/api';
import type { ExamDetail } from '@/types/external-question';
import { DevNavigation } from '@/components/DevNavigation';
import SpinnerButton from '@/components/ui/SpinnerButton';

export default function ExamsDevPage() {
  const { setConfig, resetConfig } = useHeader();

  const [exams, setExams] = useState<ExamSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedExam, setSelectedExam] = useState<string | null>(null);
  const [examDetails, setExamDetails] = useState<ExamDetail | null>(null);
  const [loadingExamDetails, setLoadingExamDetails] = useState(false);
  const [availableGroups, setAvailableGroups] = useState<string[]>([]);
  const [loadingGroups, setLoadingGroups] = useState(true);
  const [selectedGroups, setSelectedGroups] = useState<Set<string>>(new Set());
  const [examTitle, setExamTitle] = useState<string>('');
  const [welcomeTitle, setWelcomeTitle] = useState<string>('');
  const [welcomeDescription, setWelcomeDescription] = useState<string>('');
  const [welcomeCtaText, setWelcomeCtaText] = useState<string>('');
  const [showDefaultSubtitle, setShowDefaultSubtitle] = useState<boolean>(true);
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
  }, []);

  useEffect(() => {
    const loadDocumentGroups = async () => {
      setLoadingGroups(true);
      try {
        const response = await fetch('/api/documents/groups', { cache: 'no-store' });
        if (!response.ok) {
          throw new Error(`Failed to load document groups (status ${response.status})`);
        }
        const json = (await response.json()) as { groups: string[] };
        setAvailableGroups(json.groups);
      } catch (err) {
        console.error('Failed to load document groups:', err);
        setAvailableGroups([]);
      } finally {
        setLoadingGroups(false);
      }
    };

    loadDocumentGroups();
  }, []);

  useEffect(() => {
    if (!selectedExam) {
      setExamDetails(null);
      setSelectedGroups(new Set());
      setExamTitle('');
      setWelcomeTitle('');
      setWelcomeDescription('');
      setWelcomeCtaText('');
      setShowDefaultSubtitle(true);
      return;
    }

    const loadExamDetails = async () => {
      setLoadingExamDetails(true);
      try {
        const response = await fetch(`/api/exams/${encodeURIComponent(selectedExam)}`, {
          cache: 'no-store',
        });
        if (!response.ok) {
          throw new Error(`Failed to load exam details (status ${response.status})`);
        }
        const exam = (await response.json()) as ExamDetail;
        setExamDetails(exam);
        setSelectedGroups(new Set(exam.documentGroups || []));
        setExamTitle(exam.examTitle || '');
        setWelcomeTitle(exam.welcomeConfig?.title || '');
        setWelcomeDescription(exam.welcomeConfig?.description || '');
        setWelcomeCtaText(exam.welcomeConfig?.ctaText || '');
        setShowDefaultSubtitle(exam.welcomeConfig?.showDefaultSubtitle ?? true);
      } catch (err) {
        console.error('Failed to load exam details:', err);
      } finally {
        setLoadingExamDetails(false);
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
      const groups = Array.from(selectedGroups);

      const response = await fetch(`/api/exams/${encodeURIComponent(selectedExam)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          documentGroups: groups,
          examTitle: examTitle.trim() || undefined,
          welcomeConfig: {
            title: welcomeTitle.trim() || undefined,
            description: welcomeDescription.trim() || undefined,
            ctaText: welcomeCtaText.trim() || undefined,
            showDefaultSubtitle,
          },
        }),
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

  const handleGroupToggle = (groupId: string) => {
    setSelectedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(groupId)) {
        next.delete(groupId);
      } else {
        next.add(groupId);
      }
      return next;
    });
  };

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

          {selectedExam && loadingExamDetails && (
            <>
              <div className="space-y-6">
                <div className="space-y-2">
                  <div className="h-5 bg-muted rounded w-24 animate-pulse"></div>
                  <div className="h-10 bg-muted rounded w-full animate-pulse"></div>
                </div>
                <div className="space-y-4 pt-4 border-t">
                  <div className="h-6 bg-muted rounded w-48 animate-pulse"></div>
                  <div className="space-y-2">
                    <div className="h-5 bg-muted rounded w-32 animate-pulse"></div>
                    <div className="h-10 bg-muted rounded w-full animate-pulse"></div>
                  </div>
                  <div className="space-y-2">
                    <div className="h-5 bg-muted rounded w-36 animate-pulse"></div>
                    <div className="h-32 bg-muted rounded w-full animate-pulse"></div>
                  </div>
                  <div className="space-y-2">
                    <div className="h-5 bg-muted rounded w-32 animate-pulse"></div>
                    <div className="h-10 bg-muted rounded w-full animate-pulse"></div>
                  </div>
                  <div className="h-6 bg-muted rounded w-48 animate-pulse"></div>
                </div>
                <div className="space-y-2 pt-4 border-t">
                  <div className="h-5 bg-muted rounded w-36 animate-pulse"></div>
                  <div className="space-y-2">
                    <div className="h-6 bg-muted rounded w-48 animate-pulse"></div>
                    <div className="h-6 bg-muted rounded w-52 animate-pulse"></div>
                  </div>
                </div>
              </div>
            </>
          )}

          {selectedExam && examDetails && !loadingExamDetails && (
            <>
              <div className="space-y-2">
                <label className="text-sm font-medium" htmlFor="exam-title">
                  Exam Title
                </label>
                <input
                  id="exam-title"
                  type="text"
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                  placeholder="e.g., Sitecore XM Cloud Certification Exam"
                  value={examTitle}
                  onChange={(e) => setExamTitle(e.target.value)}
                />
              </div>

              <div className="space-y-4 pt-4 border-t">
                <h3 className="text-base font-semibold">Welcome Page Configuration</h3>

                <div className="space-y-2">
                  <label className="text-sm font-medium" htmlFor="welcome-title">
                    Welcome Title
                  </label>
                  <input
                    id="welcome-title"
                    type="text"
                    className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                    placeholder="e.g., Welcome to Your Study Session"
                    value={welcomeTitle}
                    onChange={(e) => setWelcomeTitle(e.target.value)}
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium" htmlFor="welcome-description">
                    Welcome Description
                  </label>
                  <p className="text-xs text-muted-foreground">Supports Markdown formatting</p>
                  <textarea
                    id="welcome-description"
                    className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring min-h-[120px]"
                    placeholder="Enter a welcome message or instructions (Markdown supported)"
                    value={welcomeDescription}
                    onChange={(e) => setWelcomeDescription(e.target.value)}
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium" htmlFor="welcome-cta">
                    Start Button Text
                  </label>
                  <input
                    id="welcome-cta"
                    type="text"
                    className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                    placeholder="e.g., Start Exam"
                    value={welcomeCtaText}
                    onChange={(e) => setWelcomeCtaText(e.target.value)}
                  />
                </div>

                <div className="space-y-2">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={showDefaultSubtitle}
                      onChange={(e) => setShowDefaultSubtitle(e.target.checked)}
                      className="w-4 h-4 rounded border-input focus:ring-2 focus:ring-ring"
                    />
                    <span className="text-sm font-medium">Show default subtitle</span>
                  </label>
                  <p className="text-xs text-muted-foreground ml-6">
                    Display the welcome title and description on the start page
                  </p>
                </div>
              </div>

              <div className="space-y-2 pt-4 border-t">
                <label className="text-sm font-medium">Document Groups</label>
                <p className="text-xs text-muted-foreground">
                  Select document groups to use for generating explanations. Leave empty to search
                  all documents.
                </p>

                {loadingGroups ? (
                  <div className="space-y-2 mt-2">
                    <div className="h-6 bg-muted rounded w-48 animate-pulse"></div>
                    <div className="h-6 bg-muted rounded w-52 animate-pulse"></div>
                    <div className="h-6 bg-muted rounded w-40 animate-pulse"></div>
                  </div>
                ) : availableGroups.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    No document groups found in the database.
                  </p>
                ) : (
                  <div className="space-y-2 mt-2">
                    {availableGroups.map((groupId) => (
                      <label
                        key={groupId}
                        className="flex items-center gap-2 cursor-pointer hover:bg-muted/50 p-2 rounded"
                      >
                        <input
                          type="checkbox"
                          checked={selectedGroups.has(groupId)}
                          onChange={() => handleGroupToggle(groupId)}
                          className="w-4 h-4 rounded border-input focus:ring-2 focus:ring-ring"
                        />
                        <span className="text-sm font-mono">{groupId}</span>
                      </label>
                    ))}
                  </div>
                )}
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
                <SpinnerButton onClick={handleSave} disabled={loadingGroups} loading={saving} loadingText="Saving…">
                  Save Settings
                </SpinnerButton>
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
