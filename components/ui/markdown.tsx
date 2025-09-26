import ReactMarkdown, { Components } from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { cn } from '@/lib/utils';

interface MarkdownContentProps {
  children: string;
  className?: string;
  variant?: 'default' | 'explanation' | 'welcome';
}

// Preprocess text to handle literal newlines and escape sequences
function preprocessMarkdown(text: string): string {
  return (
    text
      // Convert literal \n to actual newlines
      .replace(/\\n/g, '\n')
      // Convert literal \t to actual tabs
      .replace(/\\t/g, '\t')
      // Handle escaped quotes
      .replace(/\\"/g, '"')
      .replace(/\\'/g, "'")
      // Trim extra whitespace but preserve intentional formatting
      .trim()
  );
}

// Shared markdown component configurations
const markdownComponents: Components = {
  // Headings
  h1: ({ children, ...props }) => (
    <h1 className="text-3xl font-bold mt-8 mb-4 first:mt-0" {...props}>
      {children}
    </h1>
  ),
  h2: ({ children, ...props }) => (
    <h2 className="text-2xl font-semibold mt-6 mb-3 first:mt-0" {...props}>
      {children}
    </h2>
  ),
  h3: ({ children, ...props }) => (
    <h3 className="text-xl font-semibold mt-6 mb-3 first:mt-0" {...props}>
      {children}
    </h3>
  ),
  h4: ({ children, ...props }) => (
    <h4 className="text-lg font-semibold mt-4 mb-2" {...props}>
      {children}
    </h4>
  ),

  // Paragraphs
  p: ({ children, ...props }) => (
    <p className="mb-4 leading-relaxed last:mb-0" {...props}>
      {children}
    </p>
  ),

  // Lists
  ul: ({ children, ...props }) => (
    <ul className="list-disc pl-6 space-y-2 my-4" {...props}>
      {children}
    </ul>
  ),
  ol: ({ children, ...props }) => (
    <ol className="list-decimal pl-6 space-y-2 my-4" {...props}>
      {children}
    </ol>
  ),
  li: ({ children, ...props }) => (
    <li className="ml-0" {...props}>
      {children}
    </li>
  ),

  // Text formatting
  strong: ({ children, ...props }) => (
    <strong className="font-semibold" {...props}>
      {children}
    </strong>
  ),
  em: ({ children, ...props }) => (
    <em className="italic" {...props}>
      {children}
    </em>
  ),

  // Links
  a: ({ children, ...props }) => (
    <a
      className="text-primary hover:underline font-medium"
      target="_blank"
      rel="noopener noreferrer"
      {...props}
    >
      {children}
    </a>
  ),

  // Code
  code: ({ children, ...props }) => {
    // Check if this is inline code by looking at the props or context
    // For react-markdown, inline code typically doesn't have a className prop with 'language-'
    const isInline = !props.className || !props.className.includes('language-');

    if (isInline) {
      return (
        <code className="bg-muted px-1.5 py-0.5 rounded text-sm font-mono" {...props}>
          {children}
        </code>
      );
    }
    return (
      <code
        className="block bg-muted p-4 rounded-lg text-sm font-mono overflow-x-auto my-4"
        {...props}
      >
        {children}
      </code>
    );
  },

  // Code blocks
  pre: ({ children, ...props }) => (
    <pre className="bg-muted p-4 rounded-lg text-sm font-mono overflow-x-auto my-4" {...props}>
      {children}
    </pre>
  ),

  // Blockquotes
  blockquote: ({ children, ...props }) => (
    <blockquote
      className="border-l-4 border-primary pl-4 italic my-4 text-muted-foreground"
      {...props}
    >
      {children}
    </blockquote>
  ),

  // Horizontal rule
  hr: (props) => <hr className="my-6 border-border" {...props} />,

  // Tables
  table: ({ children, ...props }) => (
    <div className="overflow-x-auto my-4">
      <table className="min-w-full border-collapse border border-border" {...props}>
        {children}
      </table>
    </div>
  ),
  th: ({ children, ...props }) => (
    <th className="border border-border px-4 py-2 bg-muted font-semibold text-left" {...props}>
      {children}
    </th>
  ),
  td: ({ children, ...props }) => (
    <td className="border border-border px-4 py-2" {...props}>
      {children}
    </td>
  ),
};

export function MarkdownContent({
  children,
  className,
  variant = 'default',
}: MarkdownContentProps) {
  const processedContent = preprocessMarkdown(children);

  const variantClasses = {
    default: 'prose prose-sm max-w-none dark:prose-invert',
    explanation:
      'prose prose-sm prose-blue max-w-none dark:prose-invert text-blue-700 dark:text-blue-300',
    welcome: 'prose prose-sm max-w-none dark:prose-invert',
  };

  return (
    <div className={cn(variantClasses[variant], className)}>
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
        {processedContent}
      </ReactMarkdown>
    </div>
  );
}
