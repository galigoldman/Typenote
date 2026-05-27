import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { FocusFilesButton } from './focus-files-button';

describe('FocusFilesButton', () => {
  it('renders the label and fires onClick', () => {
    const onClick = vi.fn();
    render(<FocusFilesButton count={0} isOpen={false} onClick={onClick} />);

    const btn = screen.getByTestId('focus-files-toggle');
    expect(btn).toHaveTextContent('Focus files');
    fireEvent.click(btn);
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('shows the count badge only when count > 0', () => {
    const { rerender } = render(
      <FocusFilesButton count={0} isOpen={false} onClick={() => {}} />,
    );
    expect(screen.queryByText('3')).not.toBeInTheDocument();

    rerender(<FocusFilesButton count={3} isOpen={false} onClick={() => {}} />);
    expect(screen.getByText('3')).toBeInTheDocument();
  });

  it('reflects open state via aria-pressed', () => {
    const { rerender } = render(
      <FocusFilesButton count={0} isOpen={false} onClick={() => {}} />,
    );
    expect(screen.getByTestId('focus-files-toggle')).toHaveAttribute(
      'aria-pressed',
      'false',
    );

    rerender(<FocusFilesButton count={0} isOpen onClick={() => {}} />);
    expect(screen.getByTestId('focus-files-toggle')).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  });
});
