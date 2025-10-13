import type { QuestionDocument } from '@/types/question';
import { QuestionListItem } from './QuestionListItem';
import { Button } from '@/components/ui/button';

type PaginationData = {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
};

// Question with id field for API responses (may include populated competencies)
type QuestionWithId = QuestionDocument & { id: string };

type QuestionListProps = {
  questions: QuestionWithId[];
  showIndex?: boolean;
  emptyMessage?: string;
  showCompetencies?: boolean;
  examId?: string;
  pagination?: PaginationData | null;
  currentPage?: number;
  onPageChange?: (page: number) => void;
};

export function QuestionList({
  questions,
  showIndex = true,
  emptyMessage = 'No questions found.',
  showCompetencies = false,
  examId,
  pagination = null,
  currentPage = 1,
  onPageChange
}: QuestionListProps) {

  if (questions.length === 0) {
    return (
      <div className="text-center py-12 bg-muted/50 rounded-lg border-2 border-dashed border-border">
        <p className="text-muted-foreground">{emptyMessage}</p>
      </div>
    );
  }

  // Server-side pagination
  const totalPages = pagination?.totalPages || 1;
  const startIndex = pagination ? (pagination.page - 1) * pagination.limit : 0;

  const handlePrevPage = () => {
    if (onPageChange && currentPage > 1) {
      onPageChange(currentPage - 1);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  const handleNextPage = () => {
    if (onPageChange && currentPage < totalPages) {
      onPageChange(currentPage + 1);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  const handlePageClick = (page: number) => {
    if (onPageChange) {
      onPageChange(page);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  // Generate page numbers to show
  const getPageNumbers = () => {
    const pages: (number | string)[] = [];
    const showEllipsisThreshold = 7;

    if (totalPages <= showEllipsisThreshold) {
      // Show all pages if total is small
      for (let i = 1; i <= totalPages; i++) {
        pages.push(i);
      }
    } else {
      // Always show first page
      pages.push(1);

      if (currentPage > 3) {
        pages.push('...');
      }

      // Show pages around current page
      const start = Math.max(2, currentPage - 1);
      const end = Math.min(totalPages - 1, currentPage + 1);

      for (let i = start; i <= end; i++) {
        pages.push(i);
      }

      if (currentPage < totalPages - 2) {
        pages.push('...');
      }

      // Always show last page
      if (totalPages > 1) {
        pages.push(totalPages);
      }
    }

    return pages;
  };

  return (
    <div className="space-y-6">
      {/* Questions list */}
      <div className="space-y-4">
        {questions.map((question, index) => (
          <QuestionListItem
            key={question.id}
            question={question}
            index={showIndex ? startIndex + index : undefined}
            showIndex={showIndex}
            showCompetencies={showCompetencies}
            examId={examId}
          />
        ))}
      </div>

      {/* Pagination controls */}
      {pagination && totalPages > 1 && (
        <div className="flex flex-col items-center gap-4 pt-4">
          <div className="text-sm text-muted-foreground">
            Showing {startIndex + 1}-{Math.min(startIndex + pagination.limit, pagination.total)} of {pagination.total} questions
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handlePrevPage}
              disabled={currentPage === 1}
            >
              Previous
            </Button>

            <div className="flex items-center gap-1">
              {getPageNumbers().map((page, idx) => {
                if (page === '...') {
                  return (
                    <span key={`ellipsis-${idx}`} className="px-2 text-muted-foreground">
                      ...
                    </span>
                  );
                }

                const pageNum = page as number;
                const isActive = pageNum === currentPage;

                return (
                  <Button
                    key={pageNum}
                    variant={isActive ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => handlePageClick(pageNum)}
                    className={isActive ? '' : 'hover:bg-muted'}
                  >
                    {pageNum}
                  </Button>
                );
              })}
            </div>

            <Button
              variant="outline"
              size="sm"
              onClick={handleNextPage}
              disabled={currentPage === totalPages}
            >
              Next
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
