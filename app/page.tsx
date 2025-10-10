import HomeClient from "./HomeClient";
import { fetchExamById } from "@/lib/server/exams";
import { computeExamStats } from "@/lib/server/questions";

// Force dynamic rendering to avoid build-time database access
export const dynamic = 'force-dynamic';

export default async function Home() {
  const examId = 'sitecore-xmc';
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
