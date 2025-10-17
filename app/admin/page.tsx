import { auth } from '@/lib/auth';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { SetHeaderBreadcrumbs } from '@/components/SetHeaderBreadcrumbs';
import {
  FileText,
  GitMerge,
  BookOpen,
  HelpCircle,
  FileStack,
  Upload,
} from 'lucide-react';

const adminTools = [
  {
    title: 'Import Questions',
    description: 'Import new questions into the database',
    href: '/import',
    icon: Upload,
  },
  {
    title: 'Exams',
    description: 'Manage exam metadata and settings',
    href: '/admin/exams',
    icon: FileText,
  },
  {
    title: 'Questions',
    description: 'View and manage questions by exam',
    href: '/admin/questions/sitecore-xmc',
    icon: HelpCircle,
  },
  {
    title: 'Competencies',
    description: 'View exam competencies and coverage',
    href: '/admin/competencies',
    icon: BookOpen,
  },
  {
    title: 'Dedupe',
    description: 'Find and manage duplicate questions',
    href: '/admin/dedupe',
    icon: GitMerge,
  },
  {
    title: 'Document Embeddings',
    description: 'Semantic search across documents',
    href: '/admin/document-embeddings',
    icon: FileStack,
  },
  {
    title: 'Developer Guides',
    description: 'CLI tools and developer documentation',
    href: '/admin/developer-docs',
    icon: FileText,
  },
];

export default async function AdminPage() {
  const session = await auth();

  if (!session?.user || session.user.role !== 'admin') {
    redirect('/login');
  }

  return (
    <div className="space-y-8">
      <SetHeaderBreadcrumbs items={[{ label: 'Home', href: '/' }, { label: 'Admin' }]} />
      <div>
        <h1 className="text-3xl font-bold mb-2">Admin Panel</h1>
        <p className="text-gray-600 dark:text-gray-400">
          Manage exams, questions, and application data
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {adminTools.map((tool) => {
          const Icon = tool.icon;
          return (
            <Card key={tool.href} className="p-6 hover:shadow-lg transition-shadow">
              <Link href={tool.href} className="block">
                <div className="flex items-start gap-4">
                  <div className="p-3 bg-blue-100 dark:bg-blue-900 rounded-lg">
                    <Icon className="h-6 w-6 text-blue-600 dark:text-blue-300" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="font-semibold mb-1">{tool.title}</h3>
                    <p className="text-sm text-gray-600 dark:text-gray-400">
                      {tool.description}
                    </p>
                  </div>
                </div>
              </Link>
            </Card>
          );
        })}
      </div>

      <div className="mt-8">
        <Button variant="outline" asChild>
          <Link href="/">Back to Home</Link>
        </Button>
      </div>
    </div>
  );
}
