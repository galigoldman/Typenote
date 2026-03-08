import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock katex before importing component
vi.mock('katex', () => ({
  default: {
    renderToString: (latex: string) => `rendered:${latex}`,
  },
}));

// Mock math-api before importing component
vi.mock('@/lib/editor/math-api', () => ({
  translateMathToLatex: vi.fn(),
}));

// Mock @tiptap/react NodeViewWrapper to a plain span
vi.mock('@tiptap/react', () => ({
  NodeViewWrapper: ({
    children,
    ...props
  }: {
    children: React.ReactNode;
    [key: string]: unknown;
  }) => <span {...props}>{children}</span>,
}));

import { MathNodeView, type MathNodeViewProps } from './math-node-view';
import { translateMathToLatex } from '@/lib/editor/math-api';

const mockedTranslate = vi.mocked(translateMathToLatex);

function createMockEditor() {
  return {
    commands: {
      focus: vi.fn(),
      setMathResult: vi.fn(),
    },
    getJSON: vi.fn().mockReturnValue({ type: 'doc', content: [] }),
    storage: {
      inlineMath: {
        saveFn: vi.fn().mockResolvedValue(undefined),
      },
    },
  };
}

function renderMathNodeView(
  overrides: Partial<{
    latex: string;
    naturalLanguage: string;
    selected: boolean;
  }> = {},
) {
  const latex = overrides.latex ?? '';
  const nl = overrides.naturalLanguage ?? '';
  const mockEditor = createMockEditor();

  const props = {
    node: {
      attrs: { latex, naturalLanguage: nl },
    },
    updateAttributes: vi.fn(),
    deleteNode: vi.fn(),
    selected: overrides.selected ?? false,
    editor: mockEditor,
  };

  const result = render(
    <MathNodeView {...(props as unknown as MathNodeViewProps)} />,
  );
  return { ...result, props, mockEditor };
}

describe('MathNodeView', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders textbox when latex is empty (new node)', () => {
    renderMathNodeView({ latex: '' });

    const input = screen.getByRole('textbox');
    expect(input).toBeInTheDocument();
    expect(input).toHaveFocus();
  });

  it('renders KaTeX output when latex is present (display mode)', () => {
    renderMathNodeView({ latex: 'x^2' });

    // Should show rendered KaTeX HTML
    expect(screen.getByText('rendered:x^2')).toBeInTheDocument();
    // Should NOT show a textbox
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
  });

  it('calls deleteNode on Escape when creating new node (empty latex)', async () => {
    const user = userEvent.setup();
    const { props } = renderMathNodeView({ latex: '' });

    expect(screen.getByRole('textbox')).toBeInTheDocument();
    await user.keyboard('{Escape}');

    expect(props.deleteNode).toHaveBeenCalled();
  });

  it('reverts to display on Escape when editing existing node', async () => {
    const user = userEvent.setup();
    renderMathNodeView({ latex: 'x^2' });

    // Click to enter edit mode
    await user.click(screen.getByText('rendered:x^2'));
    expect(screen.getByRole('textbox')).toBeInTheDocument();

    // Press Escape to revert
    await user.keyboard('{Escape}');

    // Should be back in display mode
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
    expect(screen.getByText('rendered:x^2')).toBeInTheDocument();
  });

  it('calls AI and setMathResult on Enter in NL mode', async () => {
    const user = userEvent.setup();
    mockedTranslate.mockResolvedValue('\\frac{a}{b}');

    const { mockEditor } = renderMathNodeView({ latex: '' });

    const input = screen.getByRole('textbox');
    await user.type(input, 'a divided by b');
    await user.keyboard('{Enter}');

    await waitFor(() => {
      expect(mockedTranslate).toHaveBeenCalledWith('a divided by b');
    });

    await waitFor(() => {
      expect(mockEditor.commands.setMathResult).toHaveBeenCalledWith(
        '\\frac{a}{b}',
        'a divided by b',
      );
    });
  });

  it('skips AI call when NL text is unchanged on re-edit', async () => {
    const user = userEvent.setup();
    renderMathNodeView({
      latex: 'x^2',
      naturalLanguage: 'x squared',
    });

    // Click to edit
    await user.click(screen.getByText('rendered:x^2'));
    const input = screen.getByRole('textbox');

    // The input should contain the existing NL text
    expect(input).toHaveValue('x squared');

    // Press Enter without changing text
    await user.keyboard('{Enter}');

    // AI should NOT be called since text is unchanged
    expect(mockedTranslate).not.toHaveBeenCalled();
  });

  it('shows error inline when AI fails', async () => {
    const user = userEvent.setup();
    mockedTranslate.mockRejectedValue(new Error('API error'));

    renderMathNodeView({ latex: '' });

    const input = screen.getByRole('textbox');
    await user.type(input, 'bad input');
    await user.keyboard('{Enter}');

    await waitFor(() => {
      expect(screen.getByText('API error')).toBeInTheDocument();
    });
  });

  it('toggles to LaTeX mode and submits without AI call', async () => {
    const user = userEvent.setup();
    const { mockEditor } = renderMathNodeView({
      latex: 'x^2',
      naturalLanguage: 'x squared',
    });

    // Click to edit
    await user.click(screen.getByText('rendered:x^2'));

    // Toggle to LaTeX mode
    const toggleButton = screen.getByRole('button', { name: /latex/i });
    await user.click(toggleButton);

    // Input should now show latex value
    const input = screen.getByRole('textbox');
    expect(input).toHaveValue('x^2');

    // Modify and submit
    await user.clear(input);
    await user.type(input, 'y^3');
    await user.keyboard('{Enter}');

    // Should NOT call AI
    expect(mockedTranslate).not.toHaveBeenCalled();

    // Should call setMathResult directly
    expect(mockEditor.commands.setMathResult).toHaveBeenCalledWith(
      'y^3',
      'x squared',
    );
  });
});
