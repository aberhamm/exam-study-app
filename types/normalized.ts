// src/types/normalized.ts
export type NormalizedQuestion = {
  id: string; // generated (stable) since your schema has no id
  prompt: string;
  choices: [string, string, string, string];
  answerIndex: 0 | 1 | 2 | 3;
  explanation?: string;
  study?: { chunkId: string; url?: string; anchor?: string; excerpt?: string }[];
};
