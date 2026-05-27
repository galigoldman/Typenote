import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { PersonalFileItem } from '../personal-file-item';
import type { PersonalFile } from '@/types/database';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({
    storage: { from: () => ({ createSignedUrl: vi.fn() }) },
  }),
}));

const base: PersonalFile = {
  id: 'pf1',
  user_id: 'owner-A',
  course_id: 'c1',
  category: 'material',
  file_name: 'a.pdf',
  display_name: 'a',
  mime_type: 'application/pdf',
  file_size: 10,
  storage_path: 'owner-A/c1/a.pdf',
  created_at: '',
  updated_at: '',
};

describe('PersonalFileItem delete gating', () => {
  it('hides delete for a file the current user did not upload (and is not owner)', () => {
    render(
      <PersonalFileItem file={base} currentUserId="member-B" isOwner={false} />,
    );
    expect(
      screen.queryByRole('button', { name: /delete file/i }),
    ).not.toBeInTheDocument();
  });

  it('shows delete when the current user uploaded it', () => {
    render(
      <PersonalFileItem
        file={{ ...base, user_id: 'member-B' }}
        currentUserId="member-B"
        isOwner={false}
      />,
    );
    expect(
      screen.getByRole('button', { name: /delete file/i }),
    ).toBeInTheDocument();
  });

  it('shows delete for the course owner regardless of uploader', () => {
    render(<PersonalFileItem file={base} currentUserId="member-B" isOwner />);
    expect(
      screen.getByRole('button', { name: /delete file/i }),
    ).toBeInTheDocument();
  });
});
