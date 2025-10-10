import { appendFileSync, existsSync, mkdirSync } from 'fs';
import { dirname } from 'path';
import type { LogEntry } from '../types/pipeline.js';

export class Logger {
  private logPath: string;

  constructor(logPath: string) {
    this.logPath = logPath;

    // Ensure log directory exists
    const logDir = dirname(logPath);
    if (!existsSync(logDir)) {
      mkdirSync(logDir, { recursive: true });
    }
  }

  private createLogEntry(level: LogEntry['level'], message: string, data?: Record<string, unknown>): LogEntry {
    return {
      timestamp: new Date().toISOString(),
      level,
      message,
      data
    };
  }

  private writeLog(entry: LogEntry) {
    const logLine = JSON.stringify(entry) + '\n';

    // Also log to console
    const consoleMessage = `[${entry.timestamp}] ${entry.level.toUpperCase()}: ${entry.message}`;
    if (entry.level === 'error') {
      console.error(consoleMessage, entry.data || '');
    } else if (entry.level === 'warn') {
      console.warn(consoleMessage, entry.data || '');
    } else {
      console.log(consoleMessage, entry.data || '');
    }

    // Write to log file
    appendFileSync(this.logPath, logLine);
  }

  info(message: string, data?: Record<string, unknown>) {
    this.writeLog(this.createLogEntry('info', message, data));
  }

  warn(message: string, data?: Record<string, unknown>) {
    this.writeLog(this.createLogEntry('warn', message, data));
  }

  error(message: string, data?: Record<string, unknown>) {
    this.writeLog(this.createLogEntry('error', message, data));
  }
}
