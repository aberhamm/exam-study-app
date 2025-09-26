"use client";

import { Moon, Sun, Monitor } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useTheme } from "@/components/ThemeProvider";

export function ThemeToggle() {
  const { theme, setTheme } = useTheme();

  const cycleTheme = () => {
    const themes = ["light", "dark", "system"] as const;
    const currentIndex = themes.indexOf(theme);
    const nextIndex = (currentIndex + 1) % themes.length;
    setTheme(themes[nextIndex]);
  };

  const getIcon = () => {
    switch (theme) {
      case "light":
        return <Sun className="h-4 w-4" />;
      case "dark":
        return <Moon className="h-4 w-4" />;
      case "system":
        return <Monitor className="h-4 w-4" />;
      default:
        return <Sun className="h-4 w-4" />;
    }
  };

  const getLabel = () => {
    switch (theme) {
      case "light":
        return "Light mode";
      case "dark":
        return "Dark mode";
      case "system":
        return "System mode";
      default:
        return "Light mode";
    }
  };

  return (
    <Button
      variant={theme === "system" ? "outline" : "ghost"}
      size="sm"
      onClick={cycleTheme}
      aria-label={`Switch to ${theme === "light" ? "dark" : theme === "dark" ? "system" : "light"} mode`}
      title={getLabel()}
      className={`h-9 w-9 p-0 relative ${
        theme === "system" 
          ? "border-primary bg-primary/5 hover:bg-primary/10" 
          : ""
      }`}
    >
      {getIcon()}
      {theme === "system" && (
        <div className="absolute -top-1 -right-1 w-2 h-2 bg-primary rounded-full" />
      )}
    </Button>
  );
}