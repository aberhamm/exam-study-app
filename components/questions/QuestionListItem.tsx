import type { QuestionDocument } from '@/types/question';
import { MarkdownContent } from '@/components/ui/markdown';
import { Flag, Pencil, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';

type QuestionListItemProps = {
  question: QuestionDocument;
  showIndex?: boolean;
  showCompetencies?: boolean;
  examId?: string;
  // Admin actions
  onEdit?: (question: QuestionDocument & { id: string }) => void;
  onDelete?: (id: string) => void;
  processing?: {
    embedding?: { status: 'idle' | 'pending' | 'success' | 'error'; progress: number };
    competency?: { status: 'idle' | 'pending' | 'success' | 'error'; progress: number };
  };
};

export function QuestionListItem({
  question,
  showIndex = true,
  showCompetencies = false,
  onEdit,
  onDelete,
  processing,
}: QuestionListItemProps) {
  // Use competencies from question object if available
  const competencies = showCompetencies && question.competencies ? question.competencies : [];

  // Format creation date
  const formatDate = (date: Date) => {
    const d = new Date(date);
    return d.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  // Prefer id string provided by API responses
  type WithId = QuestionDocument & { id?: string };
  const questionId: string | null = typeof (question as WithId).id === 'string' ? (question as WithId).id! : null;

  return (
    <div className={`bg-card rounded-lg border transition-colors ${
      question.flaggedForReview
        ? 'border-orange-300 dark:border-orange-700 hover:border-orange-400 dark:hover:border-orange-600 bg-orange-50/30 dark:bg-orange-950/20'
        : 'border-border hover:border-border/80'
    }`}>
      {/* Header: Metadata and Competencies */}
      {showIndex && questionId && (
        <div className="px-6 pt-4 pb-3 border-b border-border/50 flex items-start justify-between gap-4">
          <div className="flex items-center gap-4 text-xs text-muted-foreground">
            <div className="flex items-center gap-2">
              <span className="font-medium">ID:</span>
              <span className="font-mono select-all">
                {questionId}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <span>Created:</span>
              <span>{formatDate(question.createdAt)}</span>
            </div>
            {question.flaggedForReview && (
              <div className="flex items-center gap-1.5 text-orange-600 dark:text-orange-400" title={question.flaggedReason || 'Flagged for review'}>
                <Flag className="h-3.5 w-3.5" />
                <span className="font-medium">Flagged</span>
              </div>
            )}
          </div>
          {showCompetencies && competencies.length > 0 && (
            <div className="flex items-center gap-1 flex-wrap justify-end">
              {competencies.map((competency) => (
                <span
                  key={competency.id}
                  className="inline-flex items-center px-2 py-0.5 rounded-md bg-primary/10 text-primary text-xs font-medium"
                  title={competency.title}
                >
                  {competency.title}
                </span>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Question Text */}
      <div className="px-6 pt-5 pb-4">
        <h3 className="text-lg font-medium text-foreground leading-relaxed">
          {question.question}
        </h3>
      </div>

      {/* Options */}
      <div className="px-6 pb-4">
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
                  <span className="ml-2 text-green-600 dark:text-green-400 text-xs font-medium">
                    ✓ Correct
                  </span>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Explanation */}
      {question.explanation && (
        <div className="px-6 pb-4">
          <div className="p-4 bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 rounded-md">
            <p className="text-sm font-semibold text-blue-900 dark:text-blue-100 mb-2">
              Explanation
            </p>
            <div className="text-sm text-blue-800 dark:text-blue-200 prose prose-sm dark:prose-invert max-w-none prose-blue">
              <MarkdownContent>{question.explanation}</MarkdownContent>
            </div>
          </div>
        </div>
      )}

      {/* Flagged Reason */}
      {question.flaggedForReview && question.flaggedReason && (
        <div className="px-6 pb-4">
          <div className="p-4 bg-orange-50 dark:bg-orange-950/30 border border-orange-200 dark:border-orange-800 rounded-md">
            <div className="flex items-center gap-2 mb-2">
              <Flag className="h-4 w-4 text-orange-600 dark:text-orange-400" />
              <p className="text-sm font-semibold text-orange-900 dark:text-orange-100">
                Review Notes
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
        </div>
      )}
      {/* Processing Progress */}
      {((processing?.embedding && processing.embedding.status !== 'idle') ||
        (processing?.competency && processing.competency.status !== 'idle')) && (
        <div className="px-6 pb-4 space-y-3">
          {(processing?.embedding && processing.embedding.status !== 'idle') && (
            <div>
              <div className="text-xs text-muted-foreground mb-1.5">Embedding</div>
              <div className="h-1.5 rounded bg-muted overflow-hidden">
                <div
                  className={`h-full transition-all ${
                    processing.embedding.status === 'error'
                      ? 'bg-red-500'
                      : processing.embedding.status === 'success'
                      ? 'bg-emerald-500'
                      : 'bg-primary'
                  }`}
                  style={{ width: `${Math.max(5, Math.min(100, Math.round(processing.embedding.progress)))}%` }}
                />
              </div>
            </div>
          )}
          {(processing?.competency && processing.competency.status !== 'idle') && (
            <div>
              <div className="text-xs text-muted-foreground mb-1.5">Competency Assignment</div>
              <div className="h-1.5 rounded bg-muted overflow-hidden">
                <div
                  className={`h-full transition-all ${
                    processing.competency.status === 'error'
                      ? 'bg-red-500'
                      : processing.competency.status === 'success'
                      ? 'bg-emerald-500'
                      : 'bg-blue-500'
                  }`}
                  style={{ width: `${Math.max(5, Math.min(100, Math.round(processing.competency.progress)))}%` }}
                />
              </div>
            </div>
          )}
        </div>
      )}

      {/* Action Buttons */}
      {(onEdit || onDelete) && (
        <div className="px-6 pb-4 pt-2 border-t border-border/50 flex items-center justify-end gap-2">
          {onEdit && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => { if (questionId) onEdit({ ...(question as QuestionDocument), id: questionId }); }}
              title="Edit question"
            >
              <Pencil className="h-4 w-4 mr-1.5" />
              Edit
            </Button>
          )}
          {onDelete && (
            <Button
              size="sm"
              variant="ghost"
              className="text-red-600 hover:text-red-700 hover:bg-red-50 dark:text-red-400 dark:hover:text-red-300 dark:hover:bg-red-950/40"
              onClick={() => { if (questionId) onDelete(questionId); }}
              title="Delete question"
            >
              <Trash2 className="h-4 w-4 mr-1.5" />
              Delete
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
