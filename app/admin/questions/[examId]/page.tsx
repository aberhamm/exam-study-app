import { QuestionsPageClient } from '@/components/questions/QuestionsPageClient';
import { SetHeaderBreadcrumbs } from '@/components/SetHeaderBreadcrumbs';
import { notFound } from 'next/navigation';
import { fetchExamById, listExamSummaries } from '@/lib/server/exams';

type PageProps = {
  params: Promise<{ examId: string }>;
};

type ExamSummary = {
  examId: string;
  examTitle: string;
  questionCount: number;
};

type ExamData = {
  examId: string;
  examTitle: string;
};

async function getExamDetails(examId: string): Promise<ExamData | null> {
  try {
    const exam = await fetchExamById(examId);
    if (!exam) return null;
    return { examId, examTitle: exam.examTitle || examId };
  } catch (error) {
    console.error('Failed to load exam details:', error);
    return null;
  }
}

async function getAllExams(): Promise<ExamSummary[]> {
  try {
    const exams = await listExamSummaries();
    // Normalize shape for client props (questionCount omitted for speed; client shows title + id)
    return exams.map((e) => ({ examId: e.examId, examTitle: e.examTitle, questionCount: 0 }));
  } catch (error) {
    console.error('Failed to load exams:', error);
    return [];
  }
}

export default async function AllQuestionsPage({ params }: PageProps) {
  const { examId } = await params;

  // Fetch exam details and all exams in parallel
  const [examData, allExams] = await Promise.all([
    getExamDetails(examId),
    getAllExams(),
  ]);

  if (!examData) {
    notFound();
  }

  return (
    <>
      <SetHeaderBreadcrumbs
        items={[
          { label: 'Home', href: '/' },
          { label: 'Admin', href: '/admin' },
          { label: 'Questions', href: '/admin/questions' },
          { label: examData.examTitle },
        ]}
      />
      <QuestionsPageClient examId={examId} examTitle={examData.examTitle} exams={allExams} />
    </>
  );
}
