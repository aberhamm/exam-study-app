import Link from 'next/link';

import { QuestionForm } from '@/components/questions/QuestionForm';

type PageProps = {
  params: Promise<{ examId: string }>;
};

type ExamData = {
  examId: string;
  examTitle?: string;
};

async function getExamDetails(examId: string): Promise<ExamData | null> {
  try {
    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000';
    const response = await fetch(`${baseUrl}/api/exams/${examId}`, { cache: 'no-store' });
    if (!response.ok) return null;
    return (await response.json()) as ExamData;
  } catch {
    return null;
  }
}

export default async function NewQuestionPage({ params }: PageProps) {
  const { examId } = await params;
  const exam = await getExamDetails(examId);

  return (
    <div className="container mx-auto px-4 py-8 max-w-3xl">
      <div className="mb-6 flex items-center justify-between">
        <Link
          href={`/admin/questions/${encodeURIComponent(examId)}`}
          className="px-4 py-2 text-sm bg-secondary text-secondary-foreground rounded-md hover:bg-secondary/80 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
        >
          ← Back to Questions
        </Link>
      </div>

      <div className="mb-6">
        <h1 className="text-3xl font-bold text-foreground mb-2">Add Question</h1>
        <p className="text-sm text-muted-foreground">
          {exam?.examTitle ? `${exam.examTitle} (${exam.examId})` : examId}
        </p>
      </div>

      <QuestionForm examId={examId} />
    </div>
  );
}

