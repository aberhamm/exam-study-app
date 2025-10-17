import { render, screen } from '@testing-library/react';
import TypewriterText from '@/components/ui/TypewriterText';

describe('TypewriterText', () => {
  it('renders full text when disabled', () => {
    const text = 'Hello, markdown **world**!';
    render(<TypewriterText text={text} enabled={false} />);
    expect(screen.getByText(text)).toBeInTheDocument();
  });
});

