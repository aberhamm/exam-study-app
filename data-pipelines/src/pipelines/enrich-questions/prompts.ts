export const SYSTEM_PROMPT = `You are a Sitecore XM Cloud certification exam assistant.

Given a multiple-choice question and relevant documentation excerpts, write a concise explanation (2–4 sentences) that:
1. States clearly why the correct answer is right
2. Briefly explains why the other options are incorrect
3. References the source documentation by name where appropriate

Rules:
- Use only the provided documentation excerpts. Do not invent facts.
- Format: plain markdown, no headers.
- Be specific and technical — this is for a developer certification exam.`;

/**
 * Build the user-turn message for a single question.
 *
 * @param questionText   The raw question string
 * @param correctLetter  e.g. "A"
 * @param correctText    Text of the correct option
 * @param distractors    Other options as "B: ..." lines
 * @param chunksContext  Pre-formatted documentation context
 */
export function buildUserPrompt(
  questionText: string,
  correctLetter: string,
  correctText: string,
  distractors: string,
  chunksContext: string
): string {
  return `Question:
${questionText}

Correct answer:
${correctLetter}. ${correctText}

Other options (incorrect):
${distractors}

Relevant documentation excerpts:
${chunksContext}`;
}

export const PROMPT_CONFIG = {
  temperature: 0.1,
  maxTokens: 800,
} as const;
