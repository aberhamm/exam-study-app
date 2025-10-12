import React from 'react'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QuestionCard } from '@/components/quiz/QuestionCard'
import { createMockQuestion, createMockMultipleQuestion } from '../../utils/test-utils'

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

describe('QuestionCard', () => {
  const mockOnSelectAnswer = jest.fn()
  const mockOnSubmitMultipleAnswer = jest.fn()
  const mockOnOpenQuestionEditor = jest.fn()

  const defaultProps = {
    selectedAnswers: null,
    showFeedback: false,
    isCurrentAnswerCorrect: false,
    isSavingQuestion: false,
    onSelectAnswer: mockOnSelectAnswer,
    onSubmitMultipleAnswer: mockOnSubmitMultipleAnswer,
    onOpenQuestionEditor: mockOnOpenQuestionEditor,
  }

  beforeEach(() => {
    jest.clearAllMocks()
  })

  describe('Single Choice Questions', () => {
    const singleQuestion = createMockQuestion()

    it('renders question prompt and choices', () => {
      render(<QuestionCard {...defaultProps} question={singleQuestion} />)

      expect(screen.getByText('What is the capital of France?')).toBeInTheDocument()
      expect(screen.getByText('Select one answer.')).toBeInTheDocument()

      expect(screen.getByText('London')).toBeInTheDocument()
      expect(screen.getByText('Berlin')).toBeInTheDocument()
      expect(screen.getByText('Paris')).toBeInTheDocument()
      expect(screen.getByText('Madrid')).toBeInTheDocument()
    })

    it('calls onSelectAnswer when choice is clicked', async () => {
      const user = userEvent.setup()
      render(<QuestionCard {...defaultProps} question={singleQuestion} />)

      const buttons = screen.getAllByRole('radio')
      await user.click(buttons[2]) // Paris is the 3rd option (index 2)

      expect(mockOnSelectAnswer).toHaveBeenCalledWith(2)
    })

    it('shows selected answer with proper styling', () => {
      render(
        <QuestionCard
          {...defaultProps}
          question={singleQuestion}
          selectedAnswers={2}
        />
      )

      const selectedChoice = screen.getByRole('radio', { checked: true })
      expect(selectedChoice).toHaveClass('border-primary')
    })

    it('disables choices when feedback is shown', () => {
      render(
        <QuestionCard
          {...defaultProps}
          question={singleQuestion}
          showFeedback={true}
          selectedAnswers={2}
        />
      )

      const choices = screen.getAllByRole('radio')
      choices.forEach(choice => {
        expect(choice).toBeDisabled()
      })
    })
  })

  describe('Multiple Choice Questions', () => {
    const multipleQuestion = createMockMultipleQuestion()

    it('renders multiple choice instructions', () => {
      render(<QuestionCard {...defaultProps} question={multipleQuestion} />)

      expect(screen.getByText('Select all that apply.')).toBeInTheDocument()
    })

    it('shows submit button for multiple choice when no feedback', () => {
      render(
        <QuestionCard
          {...defaultProps}
          question={multipleQuestion}
          selectedAnswers={[0, 2]}
        />
      )

      expect(screen.getByText('Submit Answer')).toBeInTheDocument()
    })

    it('disables submit button when no answers selected', () => {
      render(<QuestionCard {...defaultProps} question={multipleQuestion} />)

      const submitButton = screen.getByText('Submit Answer')
      expect(submitButton).toBeDisabled()
    })

    it('calls onSubmitMultipleAnswer when submit button clicked', async () => {
      const user = userEvent.setup()
      render(
        <QuestionCard
          {...defaultProps}
          question={multipleQuestion}
          selectedAnswers={[0]}
        />
      )

      await user.click(screen.getByText('Submit Answer'))

      expect(mockOnSubmitMultipleAnswer).toHaveBeenCalledTimes(1)
    })
  })

  describe('Feedback Display', () => {
    const questionWithExplanation = createMockQuestion({
      explanation: 'This is the explanation text.'
    })

    it('shows explanation when feedback is displayed', () => {
      render(
        <QuestionCard
          {...defaultProps}
          question={questionWithExplanation}
          showFeedback={true}
          selectedAnswers={2}
        />
      )

      expect(screen.getByText('Explanation:')).toBeInTheDocument()
      expect(screen.getByTestId('markdown-content')).toHaveTextContent('This is the explanation text.')
    })

    it('shows study panel when question has study materials', () => {
      render(
        <QuestionCard
          {...defaultProps}
          question={createMockQuestion()}
          showFeedback={true}
          selectedAnswers={2}
        />
      )

      expect(screen.getByTestId('study-panel')).toBeInTheDocument()
    })

    it('shows correct answer indicator when answer is correct', () => {
      render(
        <QuestionCard
          {...defaultProps}
          question={createMockQuestion()}
          showFeedback={true}
          selectedAnswers={2}
          isCurrentAnswerCorrect={true}
        />
      )

      expect(screen.getByText('Correct answer')).toBeInTheDocument()
    })

    it('shows incorrect answer indicator when answer is wrong', () => {
      render(
        <QuestionCard
          {...defaultProps}
          question={createMockQuestion()}
          showFeedback={true}
          selectedAnswers={0}
          isCurrentAnswerCorrect={false}
        />
      )

      expect(screen.getByText('Incorrect answer')).toBeInTheDocument()
    })
  })

})