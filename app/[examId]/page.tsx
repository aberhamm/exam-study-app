import HomeClient from "../HomeClient";
import { fetchExamById } from "@/lib/server/exams";
import { computeExamStats } from "@/lib/server/questions";
import type { Metadata } from "next";

// Force dynamic rendering to avoid build-time database access
export const dynamic = 'force-dynamic';

type PageProps = {
  // Next.js 15: params is async for dynamic routes
  params: Promise<{ examId: string }>;
};

export default async function ExamHomePage({ params }: PageProps) {
  const { examId: rawExamId } = await params;
  const examId = typeof rawExamId === 'string' ? rawExamId : 'sitecore-xmc';

  const [exam, stats] = await Promise.all([
    fetchExamById(examId),
    computeExamStats(examId),
  ]);

  const examMetadata = exam
    ? { examId, examTitle: exam.examTitle ?? 'Study Exam', welcomeConfig: exam.welcomeConfig }
    : { examId, examTitle: 'Study Exam' };

  return (
    <HomeClient
      examMetadata={examMetadata}
      stats={stats}
    />
  );
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { examId: rawExamId } = await params;
  const examId = typeof rawExamId === 'string' ? rawExamId : 'sitecore-xmc';

  const exam = await fetchExamById(examId);
  const title = exam?.examTitle ? `${exam.examTitle}` : 'Study Exam';

  return { title };
}
