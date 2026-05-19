import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MoodleInstallDialog } from './moodle-install-dialog';
import { Button } from '@/components/ui/button';

function renderDialog() {
  return render(
    <MoodleInstallDialog trigger={<Button>Install Extension</Button>} />,
  );
}

describe('MoodleInstallDialog', () => {
  it('does not render dialog content until the trigger is clicked', () => {
    renderDialog();
    expect(
      screen.queryByText(/install the typenote extension/i),
    ).not.toBeInTheDocument();
  });

  it('opens with the install instructions when the trigger is clicked', async () => {
    const user = userEvent.setup();
    renderDialog();

    await user.click(
      screen.getByRole('button', { name: /install extension/i }),
    );

    expect(
      screen.getByRole('heading', { name: /install the typenote extension/i }),
    ).toBeInTheDocument();
    // Anchor to one Chrome-specific term and one repo-specific term so the
    // test catches accidental copy regressions on either side.
    expect(screen.getByText(/chrome:\/\/extensions/i)).toBeInTheDocument();
    expect(screen.getByText(/Load unpacked/i)).toBeInTheDocument();
  });

  it('links to the extension folder on GitHub', async () => {
    const user = userEvent.setup();
    renderDialog();

    await user.click(
      screen.getByRole('button', { name: /install extension/i }),
    );

    const githubLink = screen.getByRole('link', { name: /view on github/i });
    expect(githubLink).toHaveAttribute(
      'href',
      'https://github.com/galigoldman/Typenote/tree/main/extension',
    );
    expect(githubLink).toHaveAttribute('target', '_blank');
    expect(githubLink).toHaveAttribute(
      'rel',
      expect.stringContaining('noreferrer'),
    );
  });

  it('closes when the user clicks "Got it"', async () => {
    const user = userEvent.setup();
    renderDialog();

    await user.click(
      screen.getByRole('button', { name: /install extension/i }),
    );
    expect(
      screen.getByRole('heading', { name: /install the typenote extension/i }),
    ).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /got it/i }));
    expect(
      screen.queryByRole('heading', {
        name: /install the typenote extension/i,
      }),
    ).not.toBeInTheDocument();
  });
});
