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

  it('adds an accessible label when exam title is provided', () => {
    render(<QuizHeader {...defaultProps} examTitle="Sample Exam" />)

    const controlGroup = screen.getByRole('group', { name: /exam controls for sample exam/i })
    expect(controlGroup).toBeInTheDocument()
  })

  it('does not render an accessible label when exam title is missing', () => {
    render(<QuizHeader {...defaultProps} />)

    expect(screen.queryByRole('group')).not.toBeInTheDocument()
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

  it('renders header actions across breakpoints', () => {
    render(<QuizHeader {...defaultProps} />)

    const quitButton = screen.getByRole('button', { name: /quit and go home/i })
    const actionsContainer = quitButton.closest('div')?.parentElement
    expect(actionsContainer).not.toHaveClass('md:hidden')
  })
})
