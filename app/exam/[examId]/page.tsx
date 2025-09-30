import ExamClient from "./ExamClient";
import { Suspense } from 'react';
import ExamSkeleton from "@/components/ExamSkeleton";
import { fetchExamById } from "@/lib/server/exams";
import type { Metadata } from 'next';

type PageProps = {
  // Next.js 15: params is async for dynamic routes
  params: Promise<{ examId: string }>;
};

export default async function ExamPage({ params }: PageProps) {
  const { examId: rawExamId } = await params;
  const examId = typeof rawExamId === 'string' ? rawExamId : 'sitecore-xmc';
  const exam = await fetchExamById(examId);
  const examTitle = exam?.examTitle;
  // Use Suspense with a skeleton so the server and client share
  // the same initial UI while data and client-only effects resolve.
  return (
    <Suspense fallback={<ExamSkeleton examTitle={examTitle ?? undefined} />}>
      <ExamClient examId={examId} examTitle={examTitle ?? undefined} />
    </Suspense>
  );
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { examId: rawExamId } = await params;
  const examId = typeof rawExamId === 'string' ? rawExamId : 'sitecore-xmc';
  const exam = await fetchExamById(examId);
  const title = exam?.examTitle ? `${exam.examTitle}` : 'Study Exam';
  return { title };
}
