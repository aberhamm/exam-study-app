import { useState, useEffect } from 'react';
import type { QuestionDocument } from '@/types/question';
import { MarkdownContent } from '@/components/ui/markdown';

type QuestionListItemProps = {
  question: QuestionDocument;
  index?: number;
  showIndex?: boolean;
  showCompetencies?: boolean;
  examId?: string;
};

export function QuestionListItem({
  question,
  index,
  showIndex = true,
  showCompetencies = false,
  examId
}: QuestionListItemProps) {
  const [competencies, setCompetencies] = useState<Array<{ id: string; title: string }>>([]);

  // Fetch competencies if showCompetencies is enabled
  useEffect(() => {
    if (!showCompetencies || !examId || !question.competencyIds || question.competencyIds.length === 0) {
      setCompetencies([]);
      return;
    }

    const fetchCompetencies = async () => {
      try {
        const response = await fetch(`/api/exams/${examId}/competencies`);
        if (response.ok) {
          const data = await response.json();
          const allCompetencies = data.competencies || [];
          const filtered = allCompetencies.filter((c: { id: string }) =>
            question.competencyIds?.includes(c.id)
          );
          setCompetencies(filtered);
        }
      } catch (err) {
        console.error('Failed to fetch competencies:', err);
      }
    };

    fetchCompetencies();
  }, [showCompetencies, examId, question.competencyIds]);
  return (
    <div className="bg-card p-6 rounded-lg border border-border hover:border-border/80 transition-colors">
      <div className="flex items-start gap-4">
        {showIndex && index !== undefined && (
          <div className="flex-shrink-0 w-8 h-8 flex items-center justify-center rounded-full bg-primary/10 text-primary font-semibold text-sm">
            {index + 1}
          </div>
        )}
        <div className="flex-1">
          <div className="flex items-start justify-between gap-4 mb-3">
            <h3 className="text-lg font-medium text-foreground flex-1">
              {question.question}
            </h3>
            {showCompetencies && competencies.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {competencies.map((competency) => (
                  <span
                    key={competency.id}
                    className="inline-flex items-center px-2 py-1 text-xs font-medium rounded-md bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300 border border-blue-200 dark:border-blue-800"
                  >
                    {competency.title}
                  </span>
                ))}
              </div>
            )}
          </div>
          <div className="space-y-2">
            {Object.entries(question.options).map(([key, value]) => {
              const isCorrect = Array.isArray(question.answer)
                ? question.answer.includes(key as 'A' | 'B' | 'C' | 'D' | 'E')
                : question.answer === key;

              return (
                <div
                  key={key}
                  className={`p-3 rounded-md text-sm ${
                    isCorrect
                      ? 'bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-800'
                      : 'bg-muted/50'
                  }`}
                >
                  <span className="font-medium mr-2">{key}.</span>
                  {value}
                  {isCorrect && (
                    <span className="ml-2 text-green-600 dark:text-green-400 text-xs">
                      ✓ Correct
                    </span>
                  )}
                </div>
              );
            })}
          </div>
          {question.explanation && (
            <div className="mt-4 p-4 bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 rounded-md">
              <p className="text-sm font-medium text-blue-900 dark:text-blue-100 mb-2">
                Explanation:
              </p>
              <div className="text-sm text-blue-800 dark:text-blue-200 prose prose-sm dark:prose-invert max-w-none prose-blue">
                <MarkdownContent>{question.explanation}</MarkdownContent>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
