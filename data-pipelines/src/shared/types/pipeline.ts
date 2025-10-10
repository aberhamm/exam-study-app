export interface PipelineConfig {
  inputPath: string;
  outputPath: string;
  model?: string;
  apiKey?: string;
  pipelineName?: string;
}

export interface PipelineResult<T> {
  success: boolean;
  data?: T;
  error?: string;
  processingTime: number;
}

export interface LogEntry {
  timestamp: string;
  level: 'info' | 'warn' | 'error';
  message: string;
  data?: Record<string, unknown>;
}