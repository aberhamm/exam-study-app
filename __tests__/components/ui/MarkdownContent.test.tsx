import React from 'react'
import { render, screen } from '@testing-library/react'
// Mock react-markdown to avoid ESM import issues while preserving link element rendering
jest.mock('react-markdown', () => ({
  __esModule: true,
  default: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}))

// Mock remark-gfm ESM export
jest.mock('remark-gfm', () => ({
  __esModule: true,
  default: () => null,
}))

import { MarkdownContent } from '@/components/ui/markdown'

describe('MarkdownContent', () => {
  it('does not render dangerous HTML', () => {
    render(<MarkdownContent>{'Hello <script>alert(1)</script>'}</MarkdownContent>)
    // No script element should appear
    expect(document.querySelector('script')).toBeNull()
    // Base content still present
    expect(screen.getByText(/Hello/)).toBeInTheDocument()
  })
})
