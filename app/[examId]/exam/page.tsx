import ExamClient from "./ExamClient";
import { Suspense } from 'react';
import ExamSkeleton from "@/components/ExamSkeleton";
import { fetchExamById } from "@/lib/server/exams";
import type { Metadata } from 'next';
import { buildExamAppTitle } from "@/lib/app-config";

// Force dynamic rendering to avoid build-time database access
export const dynamic = 'force-dynamic';

type PageProps = {
  // Next.js 15: params is async for dynamic routes
  params: Promise<{ examId: string }>;
};

export default async function ExamPage({ params }: PageProps) {
  const { examId: rawExamId } = await params;
  const examId = typeof rawExamId === 'string' ? rawExamId : 'sitecore-xmc';
  const exam = await fetchExamById(examId);
  const examTitle = buildExamAppTitle(exam?.examTitle);
  // Use Suspense with a skeleton so the server and client share
  // the same initial UI while data and client-only effects resolve.
  return (
    <Suspense fallback={<ExamSkeleton examTitle={examTitle} />}>
      <ExamClient examId={examId} examTitle={examTitle} />
    </Suspense>
  );
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { examId: rawExamId } = await params;
  const examId = typeof rawExamId === 'string' ? rawExamId : 'sitecore-xmc';
  const exam = await fetchExamById(examId);
  const title = buildExamAppTitle(exam?.examTitle);
  return { title };
}
