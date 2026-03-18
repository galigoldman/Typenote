import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ConversationList } from './conversation-list';

const mockFetch = vi.fn();
global.fetch = mockFetch;

const mockConversations = [
  {
    id: 'conv-1',
    title: 'About recursion',
    updated_at: new Date().toISOString(),
    message_count: 5,
  },
  {
    id: 'conv-2',
    title: 'Binary trees explained',
    updated_at: new Date(Date.now() - 86400000).toISOString(),
    message_count: 3,
  },
];

const defaultProps = {
  courseId: 'course-1',
  onSelect: vi.fn(),
  onNew: vi.fn(),
  onDelete: vi.fn(),
};

describe('ConversationList', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders loading state on mount', () => {
    // Never resolve the fetch so we stay in loading state
    mockFetch.mockReturnValue(new Promise(() => {}));

    render(<ConversationList {...defaultProps} />);

    expect(screen.getByText('Loading conversations...')).toBeInTheDocument();
  });

  it('renders conversation items after fetch', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ conversations: mockConversations }),
    });

    render(<ConversationList {...defaultProps} />);

    await waitFor(() => {
      expect(screen.getByText('About recursion')).toBeInTheDocument();
    });

    expect(screen.getByText('Binary trees explained')).toBeInTheDocument();
    expect(screen.getByText(/5 messages/)).toBeInTheDocument();
    expect(screen.getByText(/3 messages/)).toBeInTheDocument();
  });

  it('renders empty state when no conversations exist', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ conversations: [] }),
    });

    render(<ConversationList {...defaultProps} />);

    await waitFor(() => {
      expect(screen.getByText('No conversations yet')).toBeInTheDocument();
    });

    expect(
      screen.getByText('Start one by asking a question'),
    ).toBeInTheDocument();
  });

  it('calls onSelect when a conversation item is clicked', async () => {
    const onSelect = vi.fn();
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ conversations: mockConversations }),
    });

    render(<ConversationList {...defaultProps} onSelect={onSelect} />);

    await waitFor(() => {
      expect(screen.getByText('About recursion')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('About recursion'));

    expect(onSelect).toHaveBeenCalledWith('conv-1');
  });

  it('calls onNew when "New conversation" button is clicked', async () => {
    const onNew = vi.fn();
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ conversations: mockConversations }),
    });

    render(<ConversationList {...defaultProps} onNew={onNew} />);

    await waitFor(() => {
      expect(screen.getByText('About recursion')).toBeInTheDocument();
    });

    const user = userEvent.setup();
    await user.click(screen.getByText('New conversation'));

    expect(onNew).toHaveBeenCalledOnce();
  });

  it('deletes a conversation and removes it from the list', async () => {
    const onDelete = vi.fn();
    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ conversations: mockConversations }),
      })
      .mockResolvedValueOnce({
        ok: true,
      });

    render(<ConversationList {...defaultProps} onDelete={onDelete} />);

    await waitFor(() => {
      expect(screen.getByText('About recursion')).toBeInTheDocument();
    });

    const deleteButtons = screen.getAllByRole('button', {
      name: /delete conversation/i,
    });
    fireEvent.click(deleteButtons[0]);

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith('/api/ai/conversations/conv-1', {
        method: 'DELETE',
      });
    });

    expect(onDelete).toHaveBeenCalledWith('conv-1');

    await waitFor(() => {
      expect(screen.queryByText('About recursion')).not.toBeInTheDocument();
    });

    // The other conversation should still be visible
    expect(screen.getByText('Binary trees explained')).toBeInTheDocument();
  });

  it('highlights the active conversation with bg-muted class', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ conversations: mockConversations }),
    });

    const { container } = render(
      <ConversationList {...defaultProps} activeConversationId="conv-1" />,
    );

    await waitFor(() => {
      expect(screen.getByText('About recursion')).toBeInTheDocument();
    });

    const listItems = container.querySelectorAll('li');
    // The active item should have the exact 'bg-muted' class (not just 'bg-muted/50')
    const activeClasses = listItems[0].className.split(/\s+/);
    const inactiveClasses = listItems[1].className.split(/\s+/);
    expect(activeClasses).toContain('bg-muted');
    expect(inactiveClasses).not.toContain('bg-muted');
  });

  it('allows editing a conversation title via the pencil icon', async () => {
    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ conversations: mockConversations }),
      })
      .mockResolvedValueOnce({
        ok: true,
      });

    render(<ConversationList {...defaultProps} />);

    await waitFor(() => {
      expect(screen.getByText('About recursion')).toBeInTheDocument();
    });

    // Click the pencil/edit button for the first conversation
    const editButtons = screen.getAllByRole('button', {
      name: /edit title/i,
    });
    fireEvent.click(editButtons[0]);

    // An input should appear with the current title
    const input = screen.getByDisplayValue('About recursion');
    expect(input).toBeInTheDocument();

    // Clear and type a new title
    fireEvent.change(input, { target: { value: 'Updated recursion title' } });

    // Blur to save
    fireEvent.blur(input);

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith(
        '/api/ai/conversations/conv-1',
        expect.objectContaining({
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ title: 'Updated recursion title' }),
        }),
      );
    });

    // The new title should be displayed
    expect(screen.getByText('Updated recursion title')).toBeInTheDocument();
  });
});
