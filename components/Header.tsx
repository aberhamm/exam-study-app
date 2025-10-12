"use client";

import { ThemeToggle } from "@/components/ThemeToggle";
import { AuthButton } from "@/components/AuthButton";
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
