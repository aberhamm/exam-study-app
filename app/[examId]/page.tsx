import HomeClient from "../HomeClient";
import { fetchExamById } from "@/lib/server/exams";
import { computeExamStats } from "@/lib/server/questions";
import type { Metadata } from "next";
import { buildExamAppTitle } from "@/lib/app-config";

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

  const resolvedExamTitle = buildExamAppTitle(exam?.examTitle);

  const examMetadata = exam
    ? { examId, examTitle: resolvedExamTitle, welcomeConfig: exam.welcomeConfig }
    : { examId, examTitle: buildExamAppTitle() };

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
  const title = buildExamAppTitle(exam?.examTitle);

  return { title };
}
