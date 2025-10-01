import type { QuestionDocument } from '@/types/question';

type QuestionListItemProps = {
  question: QuestionDocument;
  index?: number;
  showIndex?: boolean;
};

export function QuestionListItem({ question, index, showIndex = true }: QuestionListItemProps) {
  return (
    <div className="bg-card p-6 rounded-lg border border-border hover:border-border/80 transition-colors">
      <div className="flex items-start gap-4">
        {showIndex && index !== undefined && (
          <div className="flex-shrink-0 w-8 h-8 flex items-center justify-center rounded-full bg-primary/10 text-primary font-semibold text-sm">
            {index + 1}
          </div>
        )}
        <div className="flex-1">
          <h3 className="text-lg font-medium text-foreground mb-3">
            {question.question}
          </h3>
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
              <p className="text-sm text-blue-800 dark:text-blue-200">
                {question.explanation}
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
