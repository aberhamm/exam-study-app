import { redirect } from 'next/navigation';
import { SetHeaderBreadcrumbs } from '@/components/SetHeaderBreadcrumbs';
import { listExamSummaries } from '@/lib/server/exams';

export default async function QuestionsLandingPage() {
  const exams = await listExamSummaries();
  if (exams.length > 0) {
    redirect(`/admin/questions/${exams[0].examId}`);
  }
  // No exams: render a tiny placeholder
  return (
    <div className="container mx-auto px-4 py-8 max-w-6xl">
      <SetHeaderBreadcrumbs items={[{ label: 'Home', href: '/' }, { label: 'Admin', href: '/admin' }, { label: 'Questions' }]} />
      <h1 className="text-2xl font-semibold mb-2">Questions</h1>
      <p className="text-sm text-muted-foreground">No exams found.</p>
    </div>
  );
}
