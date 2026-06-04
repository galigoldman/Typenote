import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AiChatPanel } from './ai-chat-panel';

// Polyfill scrollIntoView which is not implemented in jsdom
window.HTMLElement.prototype.scrollIntoView = vi.fn();

const mockFetch = vi.fn();
global.fetch = mockFetch;

// Mock MarkdownResponse to render plain text
vi.mock('./markdown-response', () => ({
  MarkdownResponse: ({ content }: { content: string }) => (
    <div data-testid="markdown">{content}</div>
  ),
}));

// Mock ConversationList to a simple placeholder
vi.mock('./conversation-list', () => ({
  ConversationList: ({
    courseId,
    onSelect,
    onNew,
    onDelete,
  }: {
    courseId: string;
    activeConversationId?: string | null;
    onSelect: (id: string) => void;
    onNew: () => void;
    onDelete: (id: string) => void;
  }) => (
    <div data-testid="conversation-list" data-course-id={courseId}>
      <button onClick={() => onSelect('conv-selected')}>Select</button>
      <button onClick={onNew}>New</button>
      <button onClick={() => onDelete('conv-deleted')}>Delete</button>
    </div>
  ),
}));

const defaultProps = {
  courseId: 'course-1',
  isOpen: true,
  onClose: vi.fn(),
  pendingContextItems: [],
};

/**
 * Helper: configure mockFetch to respond to typical initial load requests.
 * By default, returns empty conversations and a standard quota.
 */
function setupDefaultFetchResponses(overrides?: {
  conversations?: unknown[];
  messages?: unknown[];
  quota?: Record<string, unknown>;
}) {
  const conversations = overrides?.conversations ?? [];
  const messages = overrides?.messages ?? [];
  const quota = overrides?.quota ?? {
    chat: { used: 40, limit: 50, remaining: 10 },
    latex: { used: 50, limit: 150, remaining: 100 },
    tier: 'free',
    resetsAt: '2026-04-01T00:00:00Z',
    deepModeAvailable: false,
  };

  mockFetch.mockImplementation((url: string) => {
    if (typeof url === 'string') {
      // GET /api/ai/conversations?courseId=...
      if (url.includes('/api/ai/conversations') && !url.includes('/messages')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ conversations }),
        });
      }
      // GET /api/ai/conversations/<id>/messages
      if (url.includes('/messages')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ messages }),
        });
      }
      // GET /api/ai/quota
      if (url.includes('/api/ai/quota')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve(quota),
        });
      }
    }
    return Promise.resolve({ ok: false, json: () => Promise.resolve({}) });
  });
}

describe('AiChatPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFetch.mockReset();
  });

  // -----------------------------------------------------------------------
  // 1. Renders when open
  // -----------------------------------------------------------------------
  it('renders when open', async () => {
    setupDefaultFetchResponses();

    render(<AiChatPanel {...defaultProps} />);

    expect(screen.getByText('AI Tutor')).toBeInTheDocument();
  });

  // -----------------------------------------------------------------------
  // 1b. Layout: docked (default) vs overlay
  // -----------------------------------------------------------------------
  it('uses the static side-column layout by default (docked)', () => {
    setupDefaultFetchResponses();

    const { container } = render(<AiChatPanel {...defaultProps} />);
    const panel = container.firstElementChild as HTMLElement;

    // Docked panels become a static flex column on lg+.
    expect(panel.className).toContain('lg:static');
    expect(panel.className).not.toContain('lg:right-0');
  });

  it('stays a fixed right-docked drawer when docked={false}', () => {
    setupDefaultFetchResponses();

    const { container } = render(
      <AiChatPanel {...defaultProps} docked={false} />,
    );
    const panel = container.firstElementChild as HTMLElement;

    // Overlay panels must never collapse to static flow — they dock right.
    expect(panel.className).not.toContain('lg:static');
    expect(panel.className).toContain('lg:right-0');
    expect(panel.className).toContain('lg:left-auto');
  });

  // -----------------------------------------------------------------------
  // 2. Does not render when closed
  // -----------------------------------------------------------------------
  it('does not render when closed', () => {
    setupDefaultFetchResponses();

    const { container } = render(
      <AiChatPanel {...defaultProps} isOpen={false} />,
    );

    expect(container.innerHTML).toBe('');
  });

  // -----------------------------------------------------------------------
  // 3. Loads most recent conversation on open
  // -----------------------------------------------------------------------
  it('loads the most recent conversation on open', async () => {
    setupDefaultFetchResponses({
      conversations: [
        {
          id: 'conv-1',
          title: 'My Conversation',
          updated_at: '2026-03-18T00:00:00Z',
          message_count: 2,
        },
      ],
      messages: [
        { role: 'user', content: 'Hello' },
        { role: 'assistant', content: 'Hi there' },
      ],
    });

    render(<AiChatPanel {...defaultProps} />);

    // Wait for the user message and assistant message to appear
    await waitFor(() => {
      expect(screen.getByText('Hello')).toBeInTheDocument();
    });

    expect(screen.getByText('Hi there')).toBeInTheDocument();
  });

  // -----------------------------------------------------------------------
  // 4. Starts fresh when no conversations
  // -----------------------------------------------------------------------
  it('starts fresh when no conversations exist', async () => {
    setupDefaultFetchResponses({ conversations: [] });

    render(<AiChatPanel {...defaultProps} />);

    await waitFor(() => {
      expect(
        screen.getByText('Ask anything about your course materials'),
      ).toBeInTheDocument();
    });
  });

  // -----------------------------------------------------------------------
  // 5. View toggle between chat and list
  // -----------------------------------------------------------------------
  it('toggles between chat view and conversation list view', async () => {
    setupDefaultFetchResponses();
    const user = userEvent.setup();

    render(<AiChatPanel {...defaultProps} />);

    // Initially in chat view — no ConversationList rendered
    expect(screen.queryByTestId('conversation-list')).not.toBeInTheDocument();

    // Click the List icon button (aria-label "Conversation history")
    const listButton = screen.getByRole('button', {
      name: /conversation history/i,
    });
    await user.click(listButton);

    // Now conversation list should be visible
    expect(screen.getByTestId('conversation-list')).toBeInTheDocument();

    // Click again to go back to chat view
    await user.click(listButton);

    expect(screen.queryByTestId('conversation-list')).not.toBeInTheDocument();
  });

  // -----------------------------------------------------------------------
  // 6. New conversation button clears messages
  // -----------------------------------------------------------------------
  it('clears messages when the new conversation button is clicked', async () => {
    setupDefaultFetchResponses({
      conversations: [
        {
          id: 'conv-1',
          title: 'Existing',
          updated_at: '2026-03-18T00:00:00Z',
          message_count: 2,
        },
      ],
      messages: [
        { role: 'user', content: 'Hello' },
        { role: 'assistant', content: 'Hi there' },
      ],
    });

    const user = userEvent.setup();
    render(<AiChatPanel {...defaultProps} />);

    // Wait for messages to load
    await waitFor(() => {
      expect(screen.getByText('Hello')).toBeInTheDocument();
    });
    expect(screen.getByText('Hi there')).toBeInTheDocument();

    // Click the "New conversation" button
    const newButton = screen.getByRole('button', {
      name: /new conversation/i,
    });
    await user.click(newButton);

    // Messages should be cleared; empty state prompt should appear
    await waitFor(() => {
      expect(screen.queryByText('Hello')).not.toBeInTheDocument();
      expect(screen.queryByText('Hi there')).not.toBeInTheDocument();
    });

    expect(
      screen.getByText('Ask anything about your course materials'),
    ).toBeInTheDocument();
  });

  // -----------------------------------------------------------------------
  // 7. Shows quota info
  // -----------------------------------------------------------------------
  it('shows quota information', async () => {
    setupDefaultFetchResponses({
      quota: {
        chat: { used: 40, limit: 50, remaining: 10 },
        latex: { used: 50, limit: 150, remaining: 100 },
        tier: 'free',
        resetsAt: '2026-04-01T00:00:00Z',
        deepModeAvailable: false,
      },
    });

    render(<AiChatPanel {...defaultProps} />);

    await waitFor(() => {
      expect(screen.getByText('Chat: 10 of 50 remaining')).toBeInTheDocument();
    });
  });

  // -----------------------------------------------------------------------
  // 8. Handles rate limit error
  // -----------------------------------------------------------------------
  it('handles a 429 rate limit error with a friendly message', async () => {
    // Initial load: empty conversations + quota
    setupDefaultFetchResponses();

    const user = userEvent.setup();
    render(<AiChatPanel {...defaultProps} />);

    // Wait for initial load to finish
    await waitFor(() => {
      expect(
        screen.getByText('Ask anything about your course materials'),
      ).toBeInTheDocument();
    });

    // Now override fetch so the POST /api/ai/ask returns 429
    mockFetch.mockImplementation((url: string, options?: RequestInit) => {
      if (
        typeof url === 'string' &&
        url.includes('/api/ai/ask') &&
        options?.method === 'POST'
      ) {
        return Promise.resolve({
          ok: false,
          status: 429,
          json: () =>
            Promise.resolve({
              error: 'rate_limited',
              message:
                "You've reached your daily limit. Please try again tomorrow.",
              used: 50,
              limit: 50,
              resetsAt: '2026-04-01T00:00:00Z',
            }),
        });
      }
      // Fall back to defaults for other calls
      return Promise.resolve({ ok: true, json: () => Promise.resolve({}) });
    });

    // Type a question and submit
    const input = screen.getByPlaceholderText(
      'Ask anything about your course materials...',
    );
    await user.type(input, 'What is calculus?');
    fireEvent.submit(input.closest('form')!);

    // The rate limit message should appear
    await waitFor(() => {
      expect(
        screen.getByText(
          "You've reached your daily limit. Please try again tomorrow.",
        ),
      ).toBeInTheDocument();
    });
  });

  // -----------------------------------------------------------------------
  // 9. Sends conversationId in request
  // -----------------------------------------------------------------------
  it('includes conversationId in the POST body when a conversation is loaded', async () => {
    setupDefaultFetchResponses({
      conversations: [
        {
          id: 'conv-1',
          title: 'Existing',
          updated_at: '2026-03-18T00:00:00Z',
          message_count: 1,
        },
      ],
      messages: [
        { role: 'user', content: 'Previous question' },
        { role: 'assistant', content: 'Previous answer' },
      ],
    });

    const user = userEvent.setup();
    render(<AiChatPanel {...defaultProps} />);

    // Wait for the conversation to load
    await waitFor(() => {
      expect(screen.getByText('Previous question')).toBeInTheDocument();
    });

    // Now override fetch to capture the POST call and return a minimal
    // streaming response (we just need to verify the body, not full SSE)
    const postCalls: { url: string; body: string }[] = [];

    mockFetch.mockImplementation((url: string, options?: RequestInit) => {
      if (
        typeof url === 'string' &&
        url.includes('/api/ai/ask') &&
        options?.method === 'POST'
      ) {
        postCalls.push({ url, body: options.body as string });
        // Return a response with an empty readable stream to avoid errors
        const stream = new ReadableStream({
          start(controller) {
            controller.close();
          },
        });
        return Promise.resolve({
          ok: true,
          status: 200,
          body: stream,
        });
      }
      // For any other fetch calls during this phase, return empty ok
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({}),
      });
    });

    // Type a new question and submit
    const input = screen.getByPlaceholderText(
      'Ask anything about your course materials...',
    );
    await user.type(input, 'Follow-up question');
    fireEvent.submit(input.closest('form')!);

    // Wait for the POST to be made
    await waitFor(() => {
      expect(postCalls.length).toBe(1);
    });

    const body = JSON.parse(postCalls[0].body);
    expect(body.conversationId).toBe('conv-1');
    expect(body.question).toBe('Follow-up question');
    expect(body.courseId).toBe('course-1');
  });
});
