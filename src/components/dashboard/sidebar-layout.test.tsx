import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockUsePathname = vi.fn();
const mockUseRouter = vi.fn(() => ({ push: vi.fn(), back: vi.fn() }));
const mockUseMediaQuery = vi.fn();

vi.mock('next/navigation', () => ({
  usePathname: () => mockUsePathname(),
  useRouter: () => mockUseRouter(),
}));

vi.mock('@/hooks/use-media-query', () => ({
  useMediaQuery: () => mockUseMediaQuery(),
}));

vi.mock('@/hooks/use-swipe-drawer', () => ({
  useSwipeDrawer: vi.fn(),
}));

import { SidebarLayout } from './sidebar-layout';

const STORAGE_KEY = 'typenote-sidebar-collapsed';

function renderLayout() {
  return render(
    <SidebarLayout sidebar={<div data-testid="sidebar-inner">menu</div>}>
      <div data-testid="page-content">page</div>
    </SidebarLayout>,
  );
}

describe('SidebarLayout', () => {
  beforeEach(() => {
    localStorage.clear();
    mockUsePathname.mockReturnValue('/dashboard');
  });

  describe('desktop (≥1280px)', () => {
    beforeEach(() => {
      mockUseMediaQuery.mockReturnValue(true); // isDesktop = true
    });

    it('exposes an "Open sidebar" button when the user has previously collapsed it', async () => {
      // Regression: if localStorage has the sidebar collapsed, desktop users
      // had NO visible toggle anywhere — only mobile/iPad rendered the
      // hamburger header, and only the canvas editor exposed a toggle.
      // This left desktop users stuck on the dashboard root or course pages.
      localStorage.setItem(STORAGE_KEY, 'true');

      renderLayout();

      const reopenButton = screen.getByRole('button', {
        name: /open sidebar/i,
      });
      expect(reopenButton).toBeInTheDocument();
    });

    it('clicking the "Open sidebar" button reveals the sidebar content', async () => {
      localStorage.setItem(STORAGE_KEY, 'true');
      const user = userEvent.setup();

      renderLayout();

      const reopenButton = screen.getByRole('button', {
        name: /open sidebar/i,
      });
      await user.click(reopenButton);

      // After opening, the reopen affordance should no longer be shown.
      expect(
        screen.queryByRole('button', { name: /open sidebar/i }),
      ).not.toBeInTheDocument();
    });

    it('does NOT render the reopen button when the sidebar is already open', () => {
      // Default state: sidebar is open on non-document pages.
      renderLayout();

      expect(
        screen.queryByRole('button', { name: /open sidebar/i }),
      ).not.toBeInTheDocument();
    });
  });

  describe('mobile (<1280px)', () => {
    beforeEach(() => {
      mockUseMediaQuery.mockReturnValue(false); // isMobile = true
    });

    it('does NOT render the desktop reopen button (mobile has its own hamburger)', () => {
      localStorage.setItem(STORAGE_KEY, 'true');

      renderLayout();

      // The mobile hamburger has aria-label "Open menu", not "Open sidebar".
      expect(
        screen.queryByRole('button', { name: /open sidebar/i }),
      ).not.toBeInTheDocument();
    });
  });
});
