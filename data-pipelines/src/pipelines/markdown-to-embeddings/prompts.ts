export const EMBEDDING_CONFIG = {
  // Text preprocessing settings
  removeMarkdownFormatting: true,
  normalizeWhitespace: true,

  // Chunking strategy
  strategy: 'sentence-aware' as const, // 'fixed' | 'sentence-aware' | 'paragraph-aware'

  // Metadata extraction
  extractHeaders: true,
  extractCodeBlocks: false,
  preserveStructure: true,
} as const;

export const TEXT_PREPROCESSING = {
  // Patterns to clean/normalize text before embedding
  markdownPatterns: [
    /^#{1,6}\s+/gm, // Remove header markers
    /\*\*(.*?)\*\*/g, // Remove bold formatting
    /\*(.*?)\*/g, // Remove italic formatting
    /`(.*?)`/g, // Remove inline code formatting
    /\[(.*?)\]\(.*?\)/g, // Convert links to just text
    /^\s*[-*+]\s+/gm, // Remove list markers
    /^\s*\d+\.\s+/gm, // Remove numbered list markers
  ],

  // Text normalization rules
  normalizeWhitespace: true,
  removeExtraLineBreaks: true,
  trimLines: true,
} as const;

export const CHUNKING_CONFIG = {
  // Sentence boundary detection
  sentenceEndMarkers: ['.', '!', '?', '\n\n'],

  // Paragraph detection
  paragraphSeparator: /\n\s*\n/,

  // Code block handling
  codeBlockPattern: /```[\s\S]*?```/g,

  // Header detection for context
  headerPattern: /^#{1,6}\s+(.+)$/gm,
} as const;