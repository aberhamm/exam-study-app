"use client";

import Link from 'next/link';
import type { ReactNode } from 'react';

export type BreadcrumbItem = {
  label: string;
  href?: string;
  icon?: ReactNode;
};

type BreadcrumbsProps = {
  items: BreadcrumbItem[];
  className?: string;
};

export function Breadcrumbs({ items, className = '' }: BreadcrumbsProps) {
  if (!items || items.length === 0) return null;

  const lastIndex = items.length - 1;

  return (
    <nav aria-label="Breadcrumb" className={`text-sm ${className}`}>
      <ol className="flex flex-wrap items-center gap-1 text-muted-foreground">
        {items.map((item, index) => {
          const isLast = index === lastIndex;
          const content = (
            <span className={`inline-flex items-center gap-1 ${isLast ? 'text-foreground' : ''}`}>
              {item.icon}
              <span className={`${isLast ? 'truncate' : ''} max-w-[50vw]`}>{item.label}</span>
            </span>
          );

          return (
            <li key={`${item.label}-${index}`} className="inline-flex items-center">
              {item.href && !isLast ? (
                <Link href={item.href} className="hover:text-foreground transition-colors">
                  {content}
                </Link>
              ) : (
                <span aria-current={isLast ? 'page' : undefined}>{content}</span>
              )}
              {index < lastIndex && (
                <span className="mx-2 select-none text-muted-foreground/70">/</span>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

