"use client";

import { useEffect, useState, useRef } from "react";

type TimerProps = {
  initialMinutes: number;
  isRunning: boolean;
  onTimeUp: () => void;
  onTimeUpdate?: (remainingSeconds: number) => void;
};

export function Timer({ initialMinutes, isRunning, onTimeUp, onTimeUpdate }: TimerProps) {
  const [remainingSeconds, setRemainingSeconds] = useState(initialMinutes * 60);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    setRemainingSeconds(initialMinutes * 60);
  }, [initialMinutes]);

  useEffect(() => {
    if (onTimeUpdate) {
      onTimeUpdate(remainingSeconds);
    }
  }, [remainingSeconds, onTimeUpdate]);

  useEffect(() => {
    if (isRunning && remainingSeconds > 0) {
      intervalRef.current = setInterval(() => {
        setRemainingSeconds((prev) => {
          if (prev <= 1) {
            onTimeUp();
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    } else {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    }

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, [isRunning, remainingSeconds, onTimeUp]);

  const formatTime = (seconds: number): string => {
    const minutes = Math.floor(seconds / 60);
    const remainingSecs = seconds % 60;
    return `${minutes.toString().padStart(2, '0')}:${remainingSecs.toString().padStart(2, '0')}`;
  };

  const isLowTime = remainingSeconds <= 300; // 5 minutes
  const isCriticalTime = remainingSeconds <= 60; // 1 minute

  return (
    <div className="flex flex-col items-center">
      <div className="text-xs font-medium text-muted-foreground mb-1">
        {isRunning ? "Time Remaining" : "Timer Paused"}
      </div>
      <div
        className={`text-lg font-mono font-bold tabular-nums ${
          isCriticalTime
            ? "text-red-600 dark:text-red-400"
            : isLowTime
            ? "text-orange-600 dark:text-orange-400"
            : "text-foreground"
        }`}
        aria-live="polite"
        aria-label={`Time remaining: ${formatTime(remainingSeconds)}`}
      >
        {formatTime(remainingSeconds)}
      </div>
      {!isRunning && (
        <div className="text-xs text-muted-foreground mt-1">
          ⏸️ Paused
        </div>
      )}
    </div>
  );
}