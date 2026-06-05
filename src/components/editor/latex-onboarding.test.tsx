import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi } from 'vitest';
import { LaTeXOnboarding } from './latex-onboarding';
import { TooltipProvider } from '@/components/ui/tooltip';

function renderOnboarding(
  props: Partial<React.ComponentProps<typeof LaTeXOnboarding>> = {},
) {
  const defaults = {
    isFirstTime: true,
    isOpen: false,
    onDismiss: vi.fn(),
    onToggle: vi.fn(),
  };
  return render(
    <TooltipProvider>
      <LaTeXOnboarding {...defaults} {...props} />
    </TooltipProvider>,
  );
}

describe('LaTeXOnboarding', () => {
  it('renders the Sigma icon button', () => {
    renderOnboarding();
    expect(
      screen.getByRole('button', { name: 'LaTeX shortcut' }),
    ).toBeInTheDocument();
  });

  it('shows popover with message and illustration when isOpen=true', () => {
    renderOnboarding({ isOpen: true });
    expect(screen.getByText('Math made easy')).toBeInTheDocument();
    expect(
      screen.getByAltText(
        'Before and after: typed text becomes a rendered equation',
      ),
    ).toBeInTheDocument();
  });

  it('does not show popover when isOpen=false', () => {
    renderOnboarding({ isOpen: false });
    expect(screen.queryByText('Math made easy')).not.toBeInTheDocument();
  });

  it('shows "Got it" button when isFirstTime=true and isOpen=true', () => {
    renderOnboarding({ isFirstTime: true, isOpen: true });
    expect(screen.getByRole('button', { name: 'Got it' })).toBeInTheDocument();
  });

  it('hides "Got it" button when isFirstTime=false and isOpen=true', () => {
    renderOnboarding({ isFirstTime: false, isOpen: true });
    expect(
      screen.queryByRole('button', { name: 'Got it' }),
    ).not.toBeInTheDocument();
  });

  it('calls onDismiss when "Got it" is clicked', async () => {
    const user = userEvent.setup();
    const onDismiss = vi.fn();
    renderOnboarding({ isFirstTime: true, isOpen: true, onDismiss });

    await user.click(screen.getByRole('button', { name: 'Got it' }));
    expect(onDismiss).toHaveBeenCalledOnce();
  });

  it('calls onToggle when icon is clicked', async () => {
    const user = userEvent.setup();
    const onToggle = vi.fn();
    renderOnboarding({ onToggle });

    await user.click(screen.getByRole('button', { name: 'LaTeX shortcut' }));
    expect(onToggle).toHaveBeenCalledOnce();
  });
});
