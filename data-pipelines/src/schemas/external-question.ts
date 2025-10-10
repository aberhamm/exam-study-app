import { z } from 'zod';

export const StudyLinkSchema = z.object({
  chunkId: z.string(),
  url: z.string().optional(),
  anchor: z.string().optional(),
  excerpt: z.string().optional(),
});

export const ExternalQuestionSchema = z.object({
  question: z.string().min(1, 'Question cannot be empty'),
  options: z.object({
    A: z.string().min(1, 'Option A cannot be empty'),
    B: z.string().min(1, 'Option B cannot be empty'),
    C: z.string().min(1, 'Option C cannot be empty'),
    D: z.string().min(1, 'Option D cannot be empty'),
    E: z.string().optional(),
  }),
  answer: z.union([
    z.enum(['A', 'B', 'C', 'D', 'E']),
    z.array(z.enum(['A', 'B', 'C', 'D', 'E'])).min(1, 'Answer array cannot be empty'),
  ]),
  question_type: z.enum(['single', 'multiple']).optional(),
  explanation: z.string().optional(),
  study: z.array(StudyLinkSchema).optional(),
});

export const ExternalQuestionsFileSchema = z.object({
  examId: z.string().optional(),
  examTitle: z.string().optional(),
  questions: z.array(ExternalQuestionSchema).min(1, 'At least one question is required'),
});

export type ExternalQuestion = z.infer<typeof ExternalQuestionSchema>;
export type ExternalQuestionsFile = z.infer<typeof ExternalQuestionsFileSchema>;

type ExternalQuestionValidationResult =
  | { isValid: true; data: ExternalQuestion }
  | { isValid: false; data: unknown; error?: string };

export function validateExternalQuestion(data: unknown): ExternalQuestion {
  return ExternalQuestionSchema.parse(data);
}

export function validateExternalQuestionSafe(data: unknown): ExternalQuestionValidationResult {
  try {
    const validated = ExternalQuestionSchema.parse(data);
    return { isValid: true, data: validated };
  } catch (error) {
    return {
      isValid: false,
      data,
      error: error instanceof Error ? error.message : String(error)
    };
  }
}

export function validateExternalQuestionsFile(data: unknown): ExternalQuestionsFile {
  return ExternalQuestionsFileSchema.parse(data);
}

export function validateExternalQuestions(data: unknown): ExternalQuestion[] {
  if (!Array.isArray(data)) {
    throw new Error('Data must be an array of questions');
  }

  const results: ExternalQuestion[] = [];
  const validationErrors: string[] = [];
  let validatedCount = 0;
  let failedCount = 0;

  data.forEach((item, index) => {
    try {
      const validated = ExternalQuestionSchema.parse(item);
      results.push(validated);
      validatedCount++;
    } catch (error) {
      // Log validation error but don't stop processing
      const errorMessage = `Question ${index + 1} validation failed: ${error}`;
      validationErrors.push(errorMessage);
      console.warn(`⚠️  ${errorMessage}`);

      // Include the raw item even if validation fails
      results.push(item as ExternalQuestion);
      failedCount++;
    }
  });

  // Log summary of validation results
  if (validationErrors.length > 0) {
    console.warn(`📊 Validation Summary: ${validatedCount} passed, ${failedCount} failed. All items saved despite validation failures.`);
    console.warn(`❌ Validation errors:`);
    validationErrors.forEach(error => console.warn(`   - ${error}`));
  } else {
    console.log(`✅ Validation Summary: All ${validatedCount} items passed validation.`);
  }

  return results;
}
