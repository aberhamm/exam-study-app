import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QuizHeader } from '@/components/quiz/QuizHeader'
import { createMockTestSettings } from '../../utils/test-utils'

describe('QuizHeader', () => {
  const mockOnQuit = jest.fn()
  const defaultProps = {
    testSettings: createMockTestSettings(),
    onQuit: mockOnQuit,
  }

  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('renders exam title when provided', () => {
    render(<QuizHeader {...defaultProps} examTitle="Sample Exam" />)

    expect(screen.getByText('Sample Exam')).toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Sample Exam')
  })

  it('does not render title section when examTitle is not provided', () => {
    render(<QuizHeader {...defaultProps} />)

    expect(screen.queryByRole('heading', { level: 1 })).not.toBeInTheDocument()
  })

  it('displays test settings information correctly', () => {
    const testSettings = createMockTestSettings({
      questionType: 'single',
      questionCount: 25
    })

    render(<QuizHeader {...defaultProps} testSettings={testSettings} />)

    expect(screen.getByText('Single Select')).toBeInTheDocument()
    expect(screen.getByText('25 questions')).toBeInTheDocument()
  })

  it('displays "All Types" for questionType "all"', () => {
    const testSettings = createMockTestSettings({ questionType: 'all' })

    render(<QuizHeader {...defaultProps} testSettings={testSettings} />)

    expect(screen.getByText('All Types')).toBeInTheDocument()
  })

  it('displays "Multiple Select" for questionType "multiple"', () => {
    const testSettings = createMockTestSettings({ questionType: 'multiple' })

    render(<QuizHeader {...defaultProps} testSettings={testSettings} />)

    expect(screen.getByText('Multiple Select')).toBeInTheDocument()
  })

  it('calls onQuit when quit button is clicked', async () => {
    const user = userEvent.setup()
    render(<QuizHeader {...defaultProps} />)

    const quitButton = screen.getByRole('button', { name: /quit and go home/i })
    await user.click(quitButton)

    expect(mockOnQuit).toHaveBeenCalledTimes(1)
  })

  it('has proper mobile-only visibility for header actions', () => {
    render(<QuizHeader {...defaultProps} />)

    const quitButton = screen.getByRole('button', { name: /quit and go home/i })
    const mobileHeaderContainer = quitButton.closest('div')?.parentElement
    expect(mobileHeaderContainer).toHaveClass('md:hidden')
  })
})