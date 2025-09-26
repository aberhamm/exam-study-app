import OpenAI from 'openai';
import type { ExternalQuestion } from '../types/external-question.js';
import { validateExternalQuestions } from '../../schemas/external-question.js';
import { SYSTEM_PROMPT, USER_PROMPT_TEMPLATE, PROMPT_CONFIG } from '../../pipelines/markdown-to-json/prompts.js';

export class OpenRouterClient {
  private client: OpenAI;
  private model: string;

  constructor(apiKey: string, model: string = 'anthropic/claude-3.5-sonnet') {
    this.client = new OpenAI({
      baseURL: 'https://openrouter.ai/api/v1',
      apiKey: apiKey,
    });
    this.model = model;
  }

  async convertMarkdownToQuestions(markdown: string): Promise<ExternalQuestion[]> {

    try {
      const completion = await this.client.chat.completions.create({
        model: this.model,
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: USER_PROMPT_TEMPLATE(markdown) }
        ],
        temperature: PROMPT_CONFIG.temperature,
        max_tokens: PROMPT_CONFIG.maxTokens,
      });

      const content = completion.choices[0]?.message?.content;
      if (!content) {
        throw new Error('No response content from OpenRouter API');
      }

      // Parse the JSON response
      let questions: ExternalQuestion[];
      try {
        questions = JSON.parse(content);
      } catch (parseError) {
        throw new Error(`Failed to parse JSON response: ${parseError}. Response: ${content.slice(0, 500)}...`);
      }

      // Validate the response structure using Zod schema
      try {
        return validateExternalQuestions(questions);
      } catch (validationError) {
        // Log the problematic response for debugging
        console.error('Validation failed. Raw response:', JSON.stringify(questions, null, 2));
        console.warn(`Response validation failed: ${validationError}. Proceeding with raw data.`);

        // Return the raw questions even if validation fails
        return questions;
      }
    } catch (error) {
      throw new Error(`OpenRouter API error: ${error}`);
    }
  }

}