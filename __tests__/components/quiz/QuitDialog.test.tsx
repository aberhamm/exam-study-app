import React from 'react'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QuitDialog } from '@/components/quiz/QuitDialog'

// Mock the Dialog components
jest.mock('@/components/ui/dialog', () => ({
  Dialog: ({ open, children }: { open: boolean; children: React.ReactNode; onOpenChange?: (open: boolean) => void }) =>
    open ? <div data-testid="dialog">{children}</div> : null,
  DialogContent: ({ children }: { children: React.ReactNode }) => <div data-testid="dialog-content">{children}</div>,
  DialogHeader: ({ children }: { children: React.ReactNode }) => <div data-testid="dialog-header">{children}</div>,
  DialogTitle: ({ children }: { children: React.ReactNode }) => <h2 data-testid="dialog-title">{children}</h2>,
  DialogDescription: ({ children }: { children: React.ReactNode }) => <p data-testid="dialog-description">{children}</p>,
  DialogFooter: ({ children }: { children: React.ReactNode }) => <div data-testid="dialog-footer">{children}</div>,
}))

describe('QuitDialog', () => {
  const mockOnOpenChange = jest.fn()
  const mockOnConfirmQuit = jest.fn()

  const defaultProps = {
    open: false,
    onOpenChange: mockOnOpenChange,
    onConfirmQuit: mockOnConfirmQuit,
  }

  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('does not render when closed', () => {
    render(<QuitDialog {...defaultProps} open={false} />)

    expect(screen.queryByTestId('dialog')).not.toBeInTheDocument()
  })

  it('renders when open', () => {
    render(<QuitDialog {...defaultProps} open={true} />)

    expect(screen.getByTestId('dialog')).toBeInTheDocument()
  })

  it('displays correct title and description', () => {
    render(<QuitDialog {...defaultProps} open={true} />)

    expect(screen.getByTestId('dialog-title')).toHaveTextContent('Quit Exam')
    expect(screen.getByTestId('dialog-description')).toHaveTextContent(
      'Are you sure you want to quit and go home? This will lose your current progress.'
    )
  })

  it('renders cancel and quit buttons', () => {
    render(<QuitDialog {...defaultProps} open={true} />)

    expect(screen.getByText('Cancel')).toBeInTheDocument()
    expect(screen.getByText('Quit and go Home')).toBeInTheDocument()
  })

  it('calls onOpenChange with false when cancel is clicked', async () => {
    const user = userEvent.setup()
    render(<QuitDialog {...defaultProps} open={true} />)

    await user.click(screen.getByText('Cancel'))

    expect(mockOnOpenChange).toHaveBeenCalledWith(false)
  })

  it('calls onOpenChange with false and onConfirmQuit when quit is clicked', async () => {
    const user = userEvent.setup()
    render(<QuitDialog {...defaultProps} open={true} />)

    await user.click(screen.getByText('Quit and go Home'))

    expect(mockOnOpenChange).toHaveBeenCalledWith(false)
    expect(mockOnConfirmQuit).toHaveBeenCalledTimes(1)
  })

  it('applies destructive styling to quit button', () => {
    render(<QuitDialog {...defaultProps} open={true} />)

    const quitButton = screen.getByText('Quit and go Home')
    expect(quitButton).toHaveClass('bg-red-600', 'hover:bg-red-700')
  })
})