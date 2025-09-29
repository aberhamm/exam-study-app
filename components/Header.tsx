"use client";

import { ThemeToggle } from "@/components/ThemeToggle";
import { APP_CONFIG } from "@/lib/app-config";
import { useHeader } from "@/contexts/HeaderContext";

export function Header() {
  const { config } = useHeader();

  if (!config.visible) {
    return null;
  }

  const appName = config.variant === 'short' ? APP_CONFIG.APP_NAME_SHORT : APP_CONFIG.APP_NAME;

  return (
    <div className="flex justify-between items-center">
      <div className="flex items-center gap-4">
        <h1 className="text-xl font-semibold">{appName}</h1>
        {APP_CONFIG.DEV_FEATURES_ENABLED && (
          <span className="text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-100 border border-amber-300/50 select-none opacity-80">
            DEV
          </span>
        )}
        {config.leftContent}
      </div>
      <div className="flex items-center gap-3">
        {config.rightContent}
        <ThemeToggle />
      </div>
    </div>
  );
}
