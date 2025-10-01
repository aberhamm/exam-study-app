import type { QuestionDocument } from '@/types/question';
import { QuestionListItem } from './QuestionListItem';

type QuestionListProps = {
  questions: QuestionDocument[];
  showIndex?: boolean;
  emptyMessage?: string;
};

export function QuestionList({
  questions,
  showIndex = true,
  emptyMessage = 'No questions found.'
}: QuestionListProps) {
  if (questions.length === 0) {
    return (
      <div className="text-center py-12 bg-muted/50 rounded-lg border-2 border-dashed border-border">
        <p className="text-muted-foreground">{emptyMessage}</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {questions.map((question, index) => (
        <QuestionListItem
          key={question.id}
          question={question}
          index={index}
          showIndex={showIndex}
        />
      ))}
    </div>
  );
}
