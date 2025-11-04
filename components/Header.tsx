"use client";

import Link from "next/link";
import { ThemeToggle } from "@/components/ThemeToggle";
import { AuthButton } from "@/components/AuthButton";
import { APP_CONFIG, buildExamAppTitle } from "@/lib/app-config";
import { useHeader } from "@/contexts/HeaderContext";

export function Header() {
  const { config } = useHeader();

  if (!config.visible) {
    return null;
  }

  const headerTitle = config.title
    ? config.title
    : config.variant === 'short'
      ? buildExamAppTitle()
      : APP_CONFIG.APP_NAME;
  const titleHref = config.titleHref ?? "/";

  return (
    <div className="flex justify-between items-center">
      <div className="flex items-center gap-4 flex-wrap gap-y-1 min-w-0">
        <h1 className="text-xl font-semibold">
          <Link
            href={titleHref}
            className="transition hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 rounded-md px-1"
            onClick={(event) => {
              if (!config.onTitleClick) {
                return;
              }
              const shouldPrevent = config.onTitleClick(event);
              if (shouldPrevent !== false) {
                event.preventDefault();
              }
            }}
          >
            {headerTitle}
          </Link>
        </h1>
        {config.leftContent}
      </div>
      <div className="flex items-center gap-3">
        {config.rightContent}
        <AuthButton />
        <ThemeToggle />
      </div>
    </div>
  );
}
