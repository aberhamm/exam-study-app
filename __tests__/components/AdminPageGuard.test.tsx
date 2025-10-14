import React from 'react'
import { AdminPageGuard } from '@/components/AdminPageGuard'

jest.mock('next/navigation', () => ({
  redirect: jest.fn(),
}))

jest.mock('@/lib/auth', () => ({
  auth: jest.fn(),
}))

describe('AdminPageGuard', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('redirects to login when unauthenticated', async () => {
    const { redirect } = await import('next/navigation')
    const { auth } = await import('@/lib/auth')
    ;(auth as jest.Mock).mockResolvedValue(null)

    await AdminPageGuard({ children: <div>secret</div> })
    expect(redirect).toHaveBeenCalledWith('/login')
  })

  it('redirects to login when non-admin user', async () => {
    const { redirect } = await import('next/navigation')
    const { auth } = await import('@/lib/auth')
    ;(auth as jest.Mock).mockResolvedValue({ user: { id: '1', username: 'u', role: 'user' } })

    await AdminPageGuard({ children: <div>secret</div> })
    expect(redirect).toHaveBeenCalledWith('/login')
  })

  it('renders children when admin', async () => {
    const { redirect } = await import('next/navigation')
    const { auth } = await import('@/lib/auth')
    ;(auth as jest.Mock).mockResolvedValue({ user: { id: '1', username: 'a', role: 'admin' } })

    const el = await AdminPageGuard({ children: <div>secret</div> })
    // Should not call redirect
    expect(redirect).not.toHaveBeenCalled()
    // Returns a React element containing children
    // @ts-expect-error - el is JSX.Element
    expect(el.props.children.props.children).toBe('secret')
  })
})

