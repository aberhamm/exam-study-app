import React from 'react'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QuizResults } from '@/components/quiz/QuizResults'
import { createMockIncorrectAnswer } from '../../utils/test-utils'

// Mock child components
jest.mock('@/components/StudyPanel', () => ({
  StudyPanel: ({ study }: { study?: { chunkId: string; url?: string; anchor?: string; excerpt?: string }[] }) => (
    <div data-testid="study-panel">Study Panel: {study?.length} items</div>
  )
}))

jest.mock('@/components/ui/markdown', () => ({
  MarkdownContent: ({ children }: { children: React.ReactNode; variant?: string }) => (
    <div data-testid="markdown-content">{children}</div>
  )
}))

describe('QuizResults', () => {
  const mockOnResetQuiz = jest.fn()
  const mockOnGoHome = jest.fn()

  const defaultProps = {
    score: 8,
    totalQuestions: 10,
    timeElapsed: 1800, // 30 minutes
    incorrectAnswers: [],
    onResetQuiz: mockOnResetQuiz,
    onGoHome: mockOnGoHome,
  }

  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('displays quiz completion message and score', () => {
    render(<QuizResults {...defaultProps} />)

    expect(screen.getByText('Quiz Complete!')).toBeInTheDocument()
    expect(screen.getByText('8/10 (80%)')).toBeInTheDocument()
  })

  it('formats time correctly', () => {
    render(<QuizResults {...defaultProps} />)

    expect(screen.getByText('Time taken: 30:00')).toBeInTheDocument()
  })

  it('formats time with seconds correctly', () => {
    render(<QuizResults {...defaultProps} timeElapsed={1865} />)

    expect(screen.getByText('Time taken: 31:05')).toBeInTheDocument()
  })

  it('handles perfect score', () => {
    render(<QuizResults {...defaultProps} score={10} />)

    expect(screen.getByText('10/10 (100%)')).toBeInTheDocument()
  })

  it('handles zero score', () => {
    render(<QuizResults {...defaultProps} score={0} />)

    expect(screen.getByText('0/10 (0%)')).toBeInTheDocument()
  })

  it('calls onResetQuiz when "Start New Quiz" is clicked', async () => {
    const user = userEvent.setup()
    render(<QuizResults {...defaultProps} />)

    await user.click(screen.getByText('Start New Quiz'))

    expect(mockOnResetQuiz).toHaveBeenCalledTimes(1)
  })

  it('calls onGoHome when "Home" is clicked', async () => {
    const user = userEvent.setup()
    render(<QuizResults {...defaultProps} />)

    await user.click(screen.getByText('Home'))

    expect(mockOnGoHome).toHaveBeenCalledTimes(1)
  })

  describe('Incorrect Answers Review', () => {
    it('does not show review section when no incorrect answers', () => {
      render(<QuizResults {...defaultProps} />)

      expect(screen.queryByText('Review Incorrect Answers')).not.toBeInTheDocument()
    })

    it('shows review section when there are incorrect answers', () => {
      const incorrectAnswers = [createMockIncorrectAnswer()]

      render(<QuizResults {...defaultProps} incorrectAnswers={incorrectAnswers} />)

      expect(screen.getByText('Review Incorrect Answers')).toBeInTheDocument()
    })

    it('displays incorrect answer details correctly', () => {
      const incorrectAnswer = createMockIncorrectAnswer({
        question: {
          id: 'test-1',
          prompt: 'Test question?',
          choices: ['Choice A', 'Choice B', 'Choice C', 'Choice D'],
          answerIndex: 2,
          questionType: 'single',
          explanation: 'Test explanation'
        },
        selectedIndex: 0,
        correctIndex: 2
      })

      render(<QuizResults {...defaultProps} incorrectAnswers={[incorrectAnswer]} />)

      expect(screen.getByText('Test question?')).toBeInTheDocument()
      expect(screen.getByText('Choice A')).toBeInTheDocument()
      expect(screen.getByText('✗ Your answer')).toBeInTheDocument()
      expect(screen.getByText('✓ Correct')).toBeInTheDocument()
    })

    it('shows explanation for incorrect answers', () => {
      const incorrectAnswer = createMockIncorrectAnswer({
        question: {
          id: 'test-1',
          prompt: 'Test question?',
          choices: ['Choice A', 'Choice B', 'Choice C', 'Choice D'],
          answerIndex: 2,
          questionType: 'single',
          explanation: 'This is the explanation.'
        }
      })

      render(<QuizResults {...defaultProps} incorrectAnswers={[incorrectAnswer]} />)

      expect(screen.getByText('Explanation:')).toBeInTheDocument()
      expect(screen.getByTestId('markdown-content')).toHaveTextContent('This is the explanation.')
    })

    it('shows study panel for questions with study materials', () => {
      const incorrectAnswer = createMockIncorrectAnswer({
        question: {
          id: 'test-1',
          prompt: 'Test question?',
          choices: ['Choice A', 'Choice B', 'Choice C', 'Choice D'],
          answerIndex: 2,
          questionType: 'single',
          study: [{ chunkId: 'test-chunk', url: 'https://example.com' }]
        }
      })

      render(<QuizResults {...defaultProps} incorrectAnswers={[incorrectAnswer]} />)

      expect(screen.getByTestId('study-panel')).toBeInTheDocument()
    })
  })
})