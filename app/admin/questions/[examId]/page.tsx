import { QuestionsPageClient } from '@/components/questions/QuestionsPageClient';
import { notFound } from 'next/navigation';

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
    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000';
    const response = await fetch(`${baseUrl}/api/exams/${examId}`, {
      cache: 'no-store',
    });

    if (!response.ok) {
      return null;
    }

    return await response.json();
  } catch (error) {
    console.error('Failed to fetch exam details:', error);
    return null;
  }
}

async function getAllExams(): Promise<ExamSummary[]> {
  try {
    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000';
    const response = await fetch(`${baseUrl}/api/exams`, {
      cache: 'no-store',
    });

    if (!response.ok) {
      return [];
    }

    const data = await response.json();
    return data.exams || [];
  } catch (error) {
    console.error('Failed to fetch exams:', error);
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
    <QuestionsPageClient
      examId={examId}
      examTitle={examData.examTitle}
      exams={allExams}
    />
  );
}
