import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi } from 'vitest';
import { FolderCard } from './folder-card';
import type { Folder } from '@/types/database';

const mockPush = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush }),
  usePathname: () => '/dashboard',
}));

vi.mock('@/lib/actions/folders', () => ({
  createFolder: vi.fn(),
  updateFolder: vi.fn(),
  deleteFolder: vi.fn(),
}));

const mockFolder: Folder = {
  id: 'folder-1',
  user_id: 'user-1',
  parent_id: null,
  name: 'My Test Folder',
  color: '#3B82F6',
  position: 0,
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
};

describe('FolderCard', () => {
  it('renders the folder name', () => {
    render(<FolderCard folder={mockFolder} />);
    expect(screen.getByText('My Test Folder')).toBeInTheDocument();
  });

  it('renders the folder label', () => {
    render(<FolderCard folder={mockFolder} />);
    expect(screen.getByText('Folder')).toBeInTheDocument();
  });

  it('has a dropdown menu with Edit and Delete options', async () => {
    const user = userEvent.setup();
    render(<FolderCard folder={mockFolder} />);

    const menuButton = screen.getByRole('button', {
      name: /folder actions/i,
    });
    await user.click(menuButton);

    expect(screen.getByText('Edit')).toBeInTheDocument();
    expect(screen.getByText('Delete')).toBeInTheDocument();
  });

  it('navigates to the folder page on click', async () => {
    const user = userEvent.setup();
    render(<FolderCard folder={mockFolder} />);

    const card = screen.getByRole('button', { name: /my test folder/i });
    await user.click(card);

    expect(mockPush).toHaveBeenCalledWith('/dashboard/folders/folder-1');
  });
});
