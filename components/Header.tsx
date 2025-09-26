"use client";

import { ReactNode } from "react";
import { ThemeToggle } from "@/components/ThemeToggle";
import { APP_CONFIG } from "@/lib/app-config";

type HeaderProps = {
  variant?: 'full' | 'short';
  className?: string;
  leftContent?: ReactNode;
  rightContent?: ReactNode;
};

export function Header({ variant = 'full', className = '', leftContent, rightContent }: HeaderProps) {
  const appName = variant === 'short' ? APP_CONFIG.APP_NAME_SHORT : APP_CONFIG.APP_NAME;

  return (
    <div className={`flex justify-between items-center ${className}`}>
      <div className="flex items-center gap-4">
        <h1 className="text-xl font-semibold">{appName}</h1>
        {leftContent}
      </div>
      <div className="flex items-center gap-3">
        {rightContent}
        <ThemeToggle />
      </div>
    </div>
  );
}