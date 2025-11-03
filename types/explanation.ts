export type ExplanationSource = {
  url?: string;
  title?: string;
  sourceFile: string;
  sectionPath?: string;
};

export type ExplanationVersion = {
  id: string;
  savedAt: Date;
  savedBy?: { id: string; email: string } | null;
  aiGenerated?: boolean;
  reason?: 'edit' | 'delete' | 'revert' | 'import' | string;
  explanation: string;
  sources?: ExplanationSource[];
};
