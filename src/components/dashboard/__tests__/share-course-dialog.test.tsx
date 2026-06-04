import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ShareCourseDialog } from '../share-course-dialog';

vi.mock('@/lib/actions/course-sharing', () => ({
  createOrUpdateShareLink: vi.fn(async () => ({ token: 'abc123token' })),
  deactivateShareLink: vi.fn(async () => {}),
  regenerateShareLink: vi.fn(async () => ({ token: 'new456token' })),
  listMembers: vi.fn(async () => [
    { user_id: 'u-b', role: 'viewer', display_name: 'Bob', email: 'b@x.dev' },
  ]),
  updateMemberRole: vi.fn(async () => {}),
  removeMember: vi.fn(async () => {}),
}));

describe('ShareCourseDialog', () => {
  beforeEach(() => vi.clearAllMocks());

  it('generates a viewer link and shows the URL', async () => {
    const user = userEvent.setup();
    render(
      <ShareCourseDialog courseId="course-1" open onOpenChange={() => {}} />,
    );
    await user.click(
      screen.getByRole('button', { name: /create viewer link/i }),
    );
    await waitFor(() =>
      expect(screen.getByDisplayValue(/abc123token/)).toBeInTheDocument(),
    );
  });

  it('lists current members', async () => {
    render(
      <ShareCourseDialog courseId="course-1" open onOpenChange={() => {}} />,
    );
    await waitFor(() => expect(screen.getByText('Bob')).toBeInTheDocument());
  });
});
