import React from 'react'
import { render, screen, act } from '@testing-library/react'
import { Timer } from '@/components/Timer'

describe('Timer', () => {
  let intervalSpy: jest.SpyInstance
  let clearSpy: jest.SpyInstance
  beforeEach(() => {
    jest.useFakeTimers()
    intervalSpy = jest.spyOn(global, 'setInterval')
    clearSpy = jest.spyOn(global, 'clearInterval')
  })

  afterEach(() => {
    jest.useRealTimers()
    intervalSpy.mockRestore()
    clearSpy.mockRestore()
  })

  it('renders initial remaining time from minutes and elapsed', () => {
    render(
      <Timer initialMinutes={2} isRunning={false} onTimeUp={() => {}} timeElapsed={30} />
    )

    // 2:00 minus 30s = 1:30
    expect(screen.getByText('01:30')).toBeInTheDocument()
    expect(screen.getByText('Timer Paused')).toBeInTheDocument()
    expect(screen.getByText('⏸️ Paused')).toBeInTheDocument()
  })

  it('ticks down when running and calls onTimeUpdate', () => {
    const onTimeUpdate = jest.fn()
    const onTimeUp = jest.fn()

    render(
      <Timer initialMinutes={1} isRunning={true} onTimeUp={onTimeUp} onTimeUpdate={onTimeUpdate} timeElapsed={58} />
    )

    // Starts at 00:02 (1:00 - 58s)
    expect(screen.getByText('00:02')).toBeInTheDocument()
    expect(onTimeUpdate).toHaveBeenCalledWith(2)

    act(() => { jest.advanceTimersByTime(1000) })
    expect(screen.getByText('00:01')).toBeInTheDocument()
    expect(onTimeUpdate).toHaveBeenLastCalledWith(1)

    act(() => { jest.advanceTimersByTime(1000) })
    expect(screen.getByText('00:00')).toBeInTheDocument()
    expect(onTimeUp).toHaveBeenCalledTimes(1)
    expect(onTimeUpdate).toHaveBeenLastCalledWith(0)
  })

  it('applies warning/critical styles near the end', () => {
    const { rerender } = render(
      <Timer initialMinutes={10} isRunning={false} onTimeUp={() => {}} timeElapsed={9 * 60 + 10} />
    )
    // remaining 50s => critical (red)
    const critical = screen.getByText('00:50')
    expect(critical.className).toMatch(/text-red-600|dark:text-red-400/)

    rerender(
      <Timer initialMinutes={10} isRunning={false} onTimeUp={() => {}} timeElapsed={10 * 60 - 290} />
    )
    // remaining 290s (4:50) => low (orange)
    const low = screen.getByText('04:50')
    expect(low.className).toMatch(/text-orange-600|dark:text-orange-400/)
  })
})
