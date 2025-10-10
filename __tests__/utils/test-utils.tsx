import { ReactElement } from 'react'
import { render, RenderOptions } from '@testing-library/react'
import type { NormalizedQuestion } from '@/types/normalized'
import type { TestSettings } from '@/lib/test-settings'

// Mock data factories
export const createMockQuestion = (overrides: Partial<NormalizedQuestion> = {}): NormalizedQuestion => ({
  id: 'test-question-1',
  prompt: 'What is the capital of France?',
  choices: ['London', 'Berlin', 'Paris', 'Madrid'],
  answerIndex: 2,
  questionType: 'single',
  explanation: 'Paris is the capital and largest city of France.',
  study: [
    {
      chunkId: 'test-chunk-1',
      url: 'https://example.com/france',
      excerpt: 'Learn more about France...'
    }
  ],
  ...overrides,
})

export const createMockMultipleQuestion = (overrides: Partial<NormalizedQuestion> = {}): NormalizedQuestion => ({
  id: 'test-question-2',
  prompt: 'Which of the following are programming languages?',
  choices: ['JavaScript', 'HTML', 'Python', 'CSS', 'Java'],
  answerIndex: [0, 2, 4], // JavaScript, Python, Java
  questionType: 'multiple',
  explanation: 'JavaScript, Python, and Java are programming languages.',
  ...overrides,
})

export const createMockTestSettings = (overrides: Partial<TestSettings> = {}): TestSettings => ({
  questionCount: 10,
  questionType: 'all',
  timerDuration: 30,
  explanationFilter: 'all',
  ...overrides,
})

export const createMockIncorrectAnswer = (overrides = {}) => ({
  question: createMockQuestion(),
  selectedIndex: 0, // Wrong answer
  correctIndex: 2, // Correct answer
  ...overrides,
})

// Custom render function that includes providers if needed
const customRender = (
  ui: ReactElement,
  options?: Omit<RenderOptions, 'wrapper'>
) => render(ui, options)

export * from '@testing-library/react'
export { customRender as render }