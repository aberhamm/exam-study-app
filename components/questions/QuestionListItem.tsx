import type { QuestionDocument } from '@/types/question';
import { MarkdownContent } from '@/components/ui/markdown';
import { Flag } from 'lucide-react';

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
}: QuestionListItemProps) {
  // Use competencies from question object if available
  const competencies = showCompetencies && question.competencies ? question.competencies : [];
  return (
    <div className={`bg-card p-6 rounded-lg border transition-colors ${
      question.flaggedForReview
        ? 'border-orange-300 dark:border-orange-700 hover:border-orange-400 dark:hover:border-orange-600 bg-orange-50/30 dark:bg-orange-950/20'
        : 'border-border hover:border-border/80'
    }`}>
      <div className="flex items-start gap-4">
        {showIndex && index !== undefined && (
          <div className="flex-shrink-0 w-8 h-8 flex items-center justify-center rounded-full bg-primary/10 text-primary font-semibold text-sm">
            {index + 1}
          </div>
        )}
        <div className="flex-1">
          <div className="flex items-start justify-between gap-4 mb-3">
            <div className="flex items-start gap-2 flex-1">
              {question.flaggedForReview && (
                <div
                  className="flex-shrink-0 mt-1"
                  title={question.flaggedReason || 'Flagged for review'}
                >
                  <Flag className="h-5 w-5 text-orange-600 dark:text-orange-400" />
                </div>
              )}
              <h3 className="text-lg font-medium text-foreground flex-1">
                {question.question}
              </h3>
            </div>
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
          {question.flaggedForReview && question.flaggedReason && (
            <div className="mt-4 p-4 bg-orange-50 dark:bg-orange-950/30 border border-orange-200 dark:border-orange-800 rounded-md">
              <div className="flex items-center gap-2 mb-2">
                <Flag className="h-4 w-4 text-orange-600 dark:text-orange-400" />
                <p className="text-sm font-medium text-orange-900 dark:text-orange-100">
                  Flagged for Review
                </p>
              </div>
              <p className="text-sm text-orange-800 dark:text-orange-200">
                {question.flaggedReason}
              </p>
              {question.flaggedAt && (
                <p className="text-xs text-orange-600 dark:text-orange-400 mt-2">
                  Flagged on {new Date(question.flaggedAt).toLocaleDateString()}
                  {question.flaggedBy && ` by ${question.flaggedBy}`}
                </p>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
