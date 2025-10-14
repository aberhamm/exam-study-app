import React from 'react'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QuizApp } from '@/components/QuizApp'
import { HeaderProvider } from '@/contexts/HeaderContext'
import { createMockQuestion, createMockTestSettings } from '../../utils/test-utils'

// Mock Timer to avoid timing side-effects
jest.mock('@/components/Timer', () => ({
  Timer: () => <div>Timer</div>,
}))

// Mock Markdown renderer to avoid ESM module of react-markdown
jest.mock('@/components/ui/markdown', () => ({
  MarkdownContent: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="markdown">{children}</div>
  ),
}))

// Some subcomponents are already tested; keep UI light
jest.mock('@/components/quiz/QuizHeader', () => ({
  QuizHeader: () => <div>Header</div>,
}))

jest.mock('sonner', () => ({
  toast: { success: jest.fn(), error: jest.fn() },
}))

describe('QuizApp', () => {
  beforeEach(() => {
    // Avoid errors when result page triggers scroll
    // @ts-expect-error - jsdom does not implement scrollTo
    window.scrollTo = jest.fn()
    localStorage.clear()
    sessionStorage.clear()
    jest.clearAllMocks()
  })

  it('runs through a single-question flow and shows results', async () => {
    const user = userEvent.setup()
    const question = createMockQuestion()
    const settings = createMockTestSettings({ questionCount: 1 })

    render(
      <HeaderProvider>
        <QuizApp
          questions={[question]}
          testSettings={settings}
          onBackToSettings={jest.fn()}
          examId="exam-1"
          examTitle="Demo Exam"
        />
      </HeaderProvider>
    )

    // Select the correct answer (index 2)
    const radios = screen.getAllByRole('radio')
    await user.click(radios[2])

    // After single-select, feedback is shown with Finish button
    const finish = await screen.findByText('Finish Quiz')
    await user.click(finish)

    // Results page rendered with correct score
    expect(await screen.findByText('Quiz Complete!')).toBeInTheDocument()
    expect(screen.getByText('1/1 (100%)')).toBeInTheDocument()
  })
})
