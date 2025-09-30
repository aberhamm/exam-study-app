import ExamClient from "./ExamClient";
import { fetchExamById } from "@/lib/server/exams";
import type { Metadata } from 'next';

type PageProps = {
  params: { examId: string };
};

export default async function ExamPage({ params }: PageProps) {
  const examId = typeof params?.examId === 'string' ? params.examId : 'sitecore-xmc';
  const exam = await fetchExamById(examId);
  const examTitle = exam?.examTitle;
  return <ExamClient examId={examId} examTitle={examTitle ?? undefined} />;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const examId = typeof params?.examId === 'string' ? params.examId : 'sitecore-xmc';
  const exam = await fetchExamById(examId);
  const title = exam?.examTitle ? `${exam.examTitle}` : 'Study Exam';
  return { title };
}
