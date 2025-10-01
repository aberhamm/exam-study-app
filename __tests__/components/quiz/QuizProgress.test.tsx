import { render, screen } from '@testing-library/react'
import '@testing-library/jest-dom'
import { QuizProgress } from '@/components/quiz/QuizProgress'
import { createMockTestSettings } from '../../utils/test-utils'

// Mock the Timer component
jest.mock('@/components/Timer', () => ({
  Timer: ({ initialMinutes, isRunning, timeElapsed }: {
    initialMinutes: number;
    isRunning: boolean;
    timeElapsed: number;
    onTimeUp?: () => void;
    onTimeUpdate?: (remainingSeconds: number) => void;
  }) => (
    <div data-testid="timer">
      <div>Timer: {initialMinutes}min</div>
      <div>Running: {isRunning.toString()}</div>
      <div>Elapsed: {timeElapsed}s</div>
    </div>
  )
}))

describe('QuizProgress', () => {
  const mockOnTimeUp = jest.fn()
  const mockOnTimeUpdate = jest.fn()

  const defaultProps = {
    testSettings: createMockTestSettings({ timerDuration: 30 }),
    currentQuestionIndex: 2,
    totalQuestions: 10,
    timerRunning: true,
    timeElapsed: 120,
    onTimeUp: mockOnTimeUp,
    onTimeUpdate: mockOnTimeUpdate,
  }

  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('renders timer with correct props', () => {
    render(<QuizProgress {...defaultProps} />)

    const timer = screen.getByTestId('timer')
    expect(timer).toBeInTheDocument()
    expect(screen.getByText('Timer: 30min')).toBeInTheDocument()
    expect(screen.getByText('Running: true')).toBeInTheDocument()
    expect(screen.getByText('Elapsed: 120s')).toBeInTheDocument()
  })

  it('displays current question progress correctly', () => {
    render(<QuizProgress {...defaultProps} />)

    expect(screen.getByText('Question 3 of 10')).toBeInTheDocument()
  })

  it('calculates progress bar width correctly', () => {
    render(<QuizProgress {...defaultProps} />)

    const progressBar = screen.getByRole('progressbar')
    expect(progressBar).toHaveStyle('width: 30%') // (2+1)/10 * 100 = 30%
  })

  it('handles first question progress correctly', () => {
    render(<QuizProgress {...defaultProps} currentQuestionIndex={0} />)

    expect(screen.getByText('Question 1 of 10')).toBeInTheDocument()

    const progressBar = screen.getByRole('progressbar')
    expect(progressBar).toHaveStyle('width: 10%') // (0+1)/10 * 100 = 10%
  })

  it('handles last question progress correctly', () => {
    render(<QuizProgress {...defaultProps} currentQuestionIndex={9} />)

    expect(screen.getByText('Question 10 of 10')).toBeInTheDocument()

    const progressBar = screen.getByRole('progressbar')
    expect(progressBar).toHaveStyle('width: 100%') // (9+1)/10 * 100 = 100%
  })

  it('passes timer props correctly when paused', () => {
    render(<QuizProgress {...defaultProps} timerRunning={false} />)

    expect(screen.getByText('Running: false')).toBeInTheDocument()
  })
})