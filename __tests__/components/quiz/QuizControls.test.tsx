import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QuizControls } from '@/components/quiz/QuizControls'
import { createMockQuestion, createMockMultipleQuestion } from '../../utils/test-utils'

describe('QuizControls', () => {
  const mockOnNextQuestion = jest.fn()

  const defaultProps = {
    showFeedback: false,
    isLastQuestion: false,
    onNextQuestion: mockOnNextQuestion,
  }

  beforeEach(() => {
    jest.clearAllMocks()
  })

  describe('Button Display', () => {
    it('does not render button when feedback is not shown', () => {
      render(
        <QuizControls
          {...defaultProps}
          question={createMockQuestion()}
          showFeedback={false}
        />
      )

      expect(screen.queryByRole('button')).not.toBeInTheDocument()
    })

    it('renders "Next Question" button when feedback is shown and not last question', () => {
      render(
        <QuizControls
          {...defaultProps}
          question={createMockQuestion()}
          showFeedback={true}
          isLastQuestion={false}
        />
      )

      expect(screen.getByText('Next Question')).toBeInTheDocument()
    })

    it('renders "Finish Quiz" button when feedback is shown and is last question', () => {
      render(
        <QuizControls
          {...defaultProps}
          question={createMockQuestion()}
          showFeedback={true}
          isLastQuestion={true}
        />
      )

      expect(screen.getByText('Finish Quiz')).toBeInTheDocument()
    })

    it('calls onNextQuestion when button is clicked', async () => {
      const user = userEvent.setup()
      render(
        <QuizControls
          {...defaultProps}
          question={createMockQuestion()}
          showFeedback={true}
        />
      )

      await user.click(screen.getByText('Next Question'))

      expect(mockOnNextQuestion).toHaveBeenCalledTimes(1)
    })
  })

  describe('Keyboard Instructions', () => {
    it('shows single choice instructions when feedback not shown', () => {
      render(
        <QuizControls
          {...defaultProps}
          question={createMockQuestion()}
          showFeedback={false}
        />
      )

      expect(screen.getByText('Use keys 1-5 to select answers, Enter/Space to continue')).toBeInTheDocument()
    })

    it('shows multiple choice instructions when feedback not shown', () => {
      render(
        <QuizControls
          {...defaultProps}
          question={createMockMultipleQuestion()}
          showFeedback={false}
        />
      )

      expect(screen.getByText('Use keys 1-5 to toggle selections, Enter/Space to submit')).toBeInTheDocument()
    })

    it('shows continue instructions when feedback is shown for multiple choice', () => {
      render(
        <QuizControls
          {...defaultProps}
          question={createMockMultipleQuestion()}
          showFeedback={true}
        />
      )

      expect(screen.getByText('Use Enter/Space to continue to next question')).toBeInTheDocument()
    })

    it('shows same instructions for single choice regardless of feedback state', () => {
      render(
        <QuizControls
          {...defaultProps}
          question={createMockQuestion()}
          showFeedback={true}
        />
      )

      expect(screen.getByText('Use keys 1-5 to select answers, Enter/Space to continue')).toBeInTheDocument()
    })
  })
})