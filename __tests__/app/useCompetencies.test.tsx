import React from 'react'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { useCompetencies } from '@/app/hooks/useCompetencies'

function Probe({ examId }: { examId: string }) {
  const { competencies, loading, error, refetch, createCompetency, updateCompetency, deleteCompetency } = useCompetencies(examId, true)
  return (
    <div>
      <div data-testid="loading">{String(loading)}</div>
      <div data-testid="error">{error ?? ''}</div>
      <div data-testid="list">{JSON.stringify(competencies)}</div>
      <button onClick={() => refetch()} data-testid="refetch">refetch</button>
      <button
        onClick={() => createCompetency({ title: 'New', description: 'Desc', examPercentage: 10 })}
        data-testid="create"
      >create</button>
      <button
        onClick={() => updateCompetency('c1', { title: 'Updated' })}
        data-testid="update"
      >update</button>
      <button onClick={() => deleteCompetency('c1')} data-testid="delete">delete</button>
    </div>
  )
}

describe('useCompetencies', () => {
  beforeEach(() => {
    jest.resetAllMocks()
  })

  it('loads competencies successfully', async () => {
    const payload = { competencies: [{ id: 'c1', examId: 'exam-1', title: 'T', description: 'D', examPercentage: 10, createdAt: new Date(), updatedAt: new Date() }] }
    global.fetch = jest.fn().mockResolvedValue({ ok: true, json: async () => payload }) as jest.Mock

    render(<Probe examId="exam-1" />)

    await waitFor(() => expect(screen.getByTestId('loading').textContent).toBe('false'))
    expect(screen.getByTestId('list').textContent).toContain('c1')
    expect(global.fetch).toHaveBeenCalledTimes(1)
  })

  it('handles fetch error and sets error message', async () => {
    global.fetch = jest.fn().mockResolvedValue({ ok: false }) as jest.Mock
    render(<Probe examId="exam-err" />)
    await waitFor(() => expect(screen.getByTestId('loading').textContent).toBe('false'))
    expect(screen.getByTestId('error').textContent).toContain('Failed to fetch')
  })

  it('supports refetch', async () => {
    const payload1 = { competencies: [] }
    const payload2 = { competencies: [{ id: 'c1', examId: 'exam-1', title: 'A', description: 'B', examPercentage: 5, createdAt: new Date(), updatedAt: new Date() }] }
    global.fetch = jest.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => payload1 })
      .mockResolvedValueOnce({ ok: true, json: async () => payload2 }) as jest.Mock

    render(<Probe examId="exam-1" />)
    await waitFor(() => expect(screen.getByTestId('loading').textContent).toBe('false'))
    expect(screen.getByTestId('list').textContent).toBe('[]')

    fireEvent.click(screen.getByTestId('refetch'))
    await waitFor(() => expect(screen.getByTestId('list').textContent).toContain('c1'))
    expect(global.fetch).toHaveBeenCalledTimes(2)
  })

  it('create, update, and delete flows work', async () => {
    // Sequence: initial GET (empty), POST create (returns created), GET list (with created), PUT update (returns updated), DELETE remove
    const created = { id: 'c1', examId: 'exam-1', title: 'New', description: 'Desc', examPercentage: 10, createdAt: new Date(), updatedAt: new Date() }
    const updated = { competency: { id: 'c1', examId: 'exam-1', title: 'Updated', description: 'Desc', examPercentage: 10 } }

    global.fetch = jest.fn()
      // Initial GET
      .mockResolvedValueOnce({ ok: true, json: async () => ({ competencies: [] }) })
      // POST create
      .mockResolvedValueOnce({ ok: true, json: async () => ({ competency: created }) })
      // Refetch after create
      .mockResolvedValueOnce({ ok: true, json: async () => ({ competencies: [created] }) })
      // PUT update
      .mockResolvedValueOnce({ ok: true, json: async () => updated })
      // DELETE
      .mockResolvedValueOnce({ ok: true, json: async () => ({ ok: true }) }) as jest.Mock

    render(<Probe examId="exam-1" />)
    await waitFor(() => expect(screen.getByTestId('loading').textContent).toBe('false'))

    // Create
    fireEvent.click(screen.getByTestId('create'))
    await waitFor(() => expect(screen.getByTestId('list').textContent).toContain('c1'))

    // Update local state optimistically
    fireEvent.click(screen.getByTestId('update'))
    await waitFor(() => expect(screen.getByTestId('list').textContent).toContain('Updated'))

    // Delete removes from list
    fireEvent.click(screen.getByTestId('delete'))
    await waitFor(() => expect(screen.getByTestId('list').textContent).toBe('[]'))

    expect(global.fetch).toHaveBeenCalledTimes(5)
  })
})

