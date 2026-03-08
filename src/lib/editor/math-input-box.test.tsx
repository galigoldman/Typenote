import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MathInputBox } from './math-input-box';

describe('MathInputBox', () => {
  const defaultProps = {
    position: { x: 100, y: 200 },
    onSubmit: vi.fn().mockResolvedValue(undefined),
    onCancel: vi.fn(),
  };

  it('should render an input element', () => {
    render(<MathInputBox {...defaultProps} />);
    expect(
      screen.getByPlaceholderText('Describe math in plain English...')
    ).toBeInTheDocument();
  });

  it('should auto-focus the input on mount via requestAnimationFrame', async () => {
    // Mock requestAnimationFrame to execute callback synchronously
    const rafSpy = vi.spyOn(window, 'requestAnimationFrame').mockImplementation((cb) => {
      cb(0);
      return 0;
    });

    render(<MathInputBox {...defaultProps} />);
    const input = screen.getByPlaceholderText(
      'Describe math in plain English...'
    );
    expect(rafSpy).toHaveBeenCalled();
    expect(input).toHaveFocus();

    rafSpy.mockRestore();
  });

  it('should position at the given coordinates', () => {
    const { container } = render(<MathInputBox {...defaultProps} />);
    const wrapper = container.firstChild as HTMLElement;
    expect(wrapper.style.left).toBe('100px');
    expect(wrapper.style.top).toBe('200px');
  });

  it('should call onCancel when Escape is pressed', async () => {
    const onCancel = vi.fn();
    render(<MathInputBox {...defaultProps} onCancel={onCancel} />);
    const input = screen.getByPlaceholderText(
      'Describe math in plain English...'
    );
    await userEvent.type(input, '{Escape}');
    expect(onCancel).toHaveBeenCalledOnce();
  });

  it('should call onSubmit with text when Enter is pressed with content', async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    render(<MathInputBox {...defaultProps} onSubmit={onSubmit} />);
    const input = screen.getByPlaceholderText(
      'Describe math in plain English...'
    );
    await userEvent.type(input, 'one half times five');
    await userEvent.keyboard('{Enter}');
    expect(onSubmit).toHaveBeenCalledWith('one half times five');
  });

  it('should call onCancel when Enter is pressed with empty input', async () => {
    const onCancel = vi.fn();
    render(<MathInputBox {...defaultProps} onCancel={onCancel} />);
    const input = screen.getByPlaceholderText(
      'Describe math in plain English...'
    );
    await userEvent.click(input);
    await userEvent.keyboard('{Enter}');
    expect(onCancel).toHaveBeenCalledOnce();
  });
});
