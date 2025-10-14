import React from 'react'
import { render, screen, waitFor } from '@testing-library/react'
import { useQuestions } from '@/app/useQuestions'

function HookProbe({ examId = 'demo', enabled = true }: { examId?: string; enabled?: boolean }) {
  const { data, examMetadata, error, loading } = useQuestions(examId, { enabled })
  return (
    <div>
      <div data-testid="loading">{String(loading)}</div>
      <div data-testid="error">{error ?? ''}</div>
      <div data-testid="count">{data ? data.length : 0}</div>
      <div data-testid="examId">{examMetadata?.examId ?? ''}</div>
      <div data-testid="title">{examMetadata?.examTitle ?? ''}</div>
    </div>
  )
}

describe('useQuestions', () => {
  const mockQuestion = {
    question: 'What is 2+2?',
    options: { A: '3', B: '4', C: '5', D: '22' },
    answer: 'B' as const,
    question_type: 'single' as const,
  }

  beforeEach(() => {
    jest.resetAllMocks()
  })

  it('loads and normalizes questions successfully', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        examId: 'demo',
        examTitle: 'Demo Exam',
        questions: [mockQuestion],
      }),
    }) as jest.Mock

    render(<HookProbe examId="demo" />)

    // loading flips to false and one normalized question is returned
    await waitFor(() => expect(screen.getByTestId('loading').textContent).toBe('false'))
    expect(screen.getByTestId('count').textContent).toBe('1')
    expect(screen.getByTestId('examId').textContent).toBe('demo')
    expect(screen.getByTestId('title').textContent).toBe('Demo Exam')
  })

  it('handles non-OK HTTP responses and shows error', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 404,
      statusText: 'Not Found',
      json: async () => ({ error: 'Exam not found' }),
    }) as jest.Mock

    render(<HookProbe examId="missing" />)
    await waitFor(() => expect(screen.getByTestId('loading').textContent).toBe('false'))
    expect(screen.getByTestId('error').textContent).toContain('Exam not found')
    expect(screen.getByTestId('count').textContent).toBe('0')
  })

  it('does not fetch when disabled', async () => {
    const fetchSpy = jest.fn()
    global.fetch = fetchSpy as unknown as typeof fetch

    render(<HookProbe examId="demo" enabled={false} />)

    // Should immediately stop loading and not call fetch
    await waitFor(() => expect(screen.getByTestId('loading').textContent).toBe('false'))
    expect(fetchSpy).not.toHaveBeenCalled()
  })
})

