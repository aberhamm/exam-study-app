'use client';

import Link from 'next/link';
import { useState, useRef, useEffect } from 'react';
import { ChevronDown } from 'lucide-react';

type DevNavigationProps = {
  currentPage?: 'search' | 'exams' | 'dedupe' | 'import' | 'competencies' | 'docs' | 'document-embeddings';
};

export function DevNavigation({ currentPage }: DevNavigationProps) {
  const [isExamMenuOpen, setIsExamMenuOpen] = useState(false);
  const [isDocsMenuOpen, setIsDocsMenuOpen] = useState(false);
  const examMenuRef = useRef<HTMLDivElement>(null);
  const docsMenuRef = useRef<HTMLDivElement>(null);

  const examPages = ['exams', 'competencies', 'import', 'dedupe'];
  const docsPages = ['docs', 'document-embeddings'];
  const isExamPageActive = examPages.includes(currentPage || '');
  const isDocsPageActive = docsPages.includes(currentPage || '');

  // Close dropdowns when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (examMenuRef.current && !examMenuRef.current.contains(event.target as Node)) {
        setIsExamMenuOpen(false);
      }
      if (docsMenuRef.current && !docsMenuRef.current.contains(event.target as Node)) {
        setIsDocsMenuOpen(false);
      }
    }

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <div className="hidden md:flex items-center gap-3">
      {/* Exam Tools Dropdown */}
      <div className="relative" ref={examMenuRef}>
        <button
          onClick={() => setIsExamMenuOpen(!isExamMenuOpen)}
          className={`text-sm flex items-center gap-1 ${
            isExamPageActive
              ? 'text-foreground font-medium'
              : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          Exam Tools
          <ChevronDown className="h-3 w-3" />
        </button>

        {isExamMenuOpen && (
          <div className="absolute top-full left-0 mt-2 w-48 rounded-md border border-border bg-background shadow-lg z-50">
            <div className="py-1">
              <Link
                href="/import"
                onClick={() => setIsExamMenuOpen(false)}
                className={`block px-4 py-2 text-sm ${
                  currentPage === 'import'
                    ? 'bg-accent text-accent-foreground font-medium'
                    : 'text-foreground hover:bg-accent hover:text-accent-foreground'
                }`}
              >
                Import Questions
              </Link>
              <Link
                href="/dev/exams"
                onClick={() => setIsExamMenuOpen(false)}
                className={`block px-4 py-2 text-sm ${
                  currentPage === 'exams'
                    ? 'bg-accent text-accent-foreground font-medium'
                    : 'text-foreground hover:bg-accent hover:text-accent-foreground'
                }`}
              >
                Exam Settings
              </Link>
              <Link
                href="/dev/competencies"
                onClick={() => setIsExamMenuOpen(false)}
                className={`block px-4 py-2 text-sm ${
                  currentPage === 'competencies'
                    ? 'bg-accent text-accent-foreground font-medium'
                    : 'text-foreground hover:bg-accent hover:text-accent-foreground'
                }`}
              >
                Competencies
              </Link>
              <div className="my-1 border-t border-border" />
              <Link
                href="/dev/dedupe"
                onClick={() => setIsExamMenuOpen(false)}
                className={`block px-4 py-2 text-sm ${
                  currentPage === 'dedupe'
                    ? 'bg-accent text-accent-foreground font-medium'
                    : 'text-foreground hover:bg-accent hover:text-accent-foreground'
                }`}
              >
                Deduplicate
              </Link>
            </div>
          </div>
        )}
      </div>

      {/* Search - Standalone Link */}
      <Link
        href="/dev/search"
        className={`text-sm ${
          currentPage === 'search'
            ? 'text-foreground font-medium'
            : 'text-muted-foreground hover:text-foreground'
        }`}
      >
        Search
      </Link>

      {/* Documentation Dropdown */}
      <div className="relative" ref={docsMenuRef}>
        <button
          onClick={() => setIsDocsMenuOpen(!isDocsMenuOpen)}
          className={`text-sm flex items-center gap-1 ${
            isDocsPageActive
              ? 'text-foreground font-medium'
              : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          Documentation
          <ChevronDown className="h-3 w-3" />
        </button>

        {isDocsMenuOpen && (
          <div className="absolute top-full left-0 mt-2 w-48 rounded-md border border-border bg-background shadow-lg z-50">
            <div className="py-1">
              <Link
                href="/dev/docs"
                onClick={() => setIsDocsMenuOpen(false)}
                className={`block px-4 py-2 text-sm ${
                  currentPage === 'docs'
                    ? 'bg-accent text-accent-foreground font-medium'
                    : 'text-foreground hover:bg-accent hover:text-accent-foreground'
                }`}
              >
                Dev Docs
              </Link>
              <Link
                href="/dev/document-embeddings"
                onClick={() => setIsDocsMenuOpen(false)}
                className={`block px-4 py-2 text-sm ${
                  currentPage === 'document-embeddings'
                    ? 'bg-accent text-accent-foreground font-medium'
                    : 'text-foreground hover:bg-accent hover:text-accent-foreground'
                }`}
              >
                Document Embeddings
              </Link>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
