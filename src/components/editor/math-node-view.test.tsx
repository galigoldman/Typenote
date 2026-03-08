import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MathNodeView } from './math-node-view';

// Mock katex
vi.mock('katex', () => ({
  default: {
    renderToString: vi.fn((latex: string) => `<span>${latex}</span>`),
  },
}));

// Mock NodeViewWrapper to render children directly
vi.mock('@tiptap/react', () => ({
  NodeViewWrapper: ({
    children,
    ...props
  }: {
    children: React.ReactNode;
    [key: string]: unknown;
  }) => (
    <span data-testid="node-view-wrapper" {...props}>
      {children}
    </span>
  ),
}));

// Mock requestAnimationFrame
beforeEach(() => {
  vi.spyOn(window, 'requestAnimationFrame').mockImplementation((cb) => {
    cb(0);
    return 0;
  });
});

function createProps(overrides: Record<string, unknown> = {}) {
  return {
    node: {
      attrs: {
        latex: '\\frac{1}{2}',
        originalText: 'one half',
        ...((overrides.attrs as Record<string, unknown>) || {}),
      },
    },
    updateAttributes: vi.fn(),
    // Other NodeViewProps that aren't used
    editor: {} as unknown,
    getPos: vi.fn(),
    decorations: [] as unknown,
    extension: {} as unknown,
    selected: false,
    deleteNode: vi.fn(),
    HTMLAttributes: {},
    ...overrides,
  } as unknown as Parameters<typeof MathNodeView>[0];
}

describe('MathNodeView', () => {
  describe('Rendering', () => {
    it('renders the KaTeX output', () => {
      const props = createProps();
      render(<MathNodeView {...props} />);
      // katex.renderToString returns `<span>\\frac{1}{2}</span>`
      expect(screen.getByTestId('node-view-wrapper')).toBeInTheDocument();
    });

    it('does not show edit panel by default', () => {
      const props = createProps();
      render(<MathNodeView {...props} />);
      expect(screen.queryByText('Edit Expression')).not.toBeInTheDocument();
    });
  });

  describe('Opening edit panel', () => {
    it('opens the edit panel when the rendered math is clicked', async () => {
      const props = createProps();
      render(<MathNodeView {...props} />);

      // Click the rendered math span (contains the katex output)
      const mathSpan = screen.getByTestId('node-view-wrapper').querySelector('span[dangerouslysetinnerhtml]') ||
        screen.getByTestId('node-view-wrapper').querySelector('span > span');
      fireEvent.click(mathSpan!);

      expect(screen.getByText('Edit Expression')).toBeInTheDocument();
      expect(screen.getByText('Edit LaTeX')).toBeInTheDocument();
    });

    it('shows "Edit Expression" and "Edit LaTeX" mode buttons', async () => {
      const props = createProps();
      render(<MathNodeView {...props} />);

      const mathContent = screen.getByTestId('node-view-wrapper').querySelectorAll('span');
      fireEvent.click(mathContent[mathContent.length - 1]);

      expect(screen.getByText('Edit Expression')).toBeInTheDocument();
      expect(screen.getByText('Edit LaTeX')).toBeInTheDocument();
    });

    it('pre-fills input with originalText in expression mode', async () => {
      const props = createProps();
      render(<MathNodeView {...props} />);

      const mathContent = screen.getByTestId('node-view-wrapper').querySelectorAll('span');
      fireEvent.click(mathContent[mathContent.length - 1]);

      const input = screen.getByPlaceholderText('Describe math in plain English...');
      expect(input).toHaveValue('one half');
    });

    it('pre-fills input with latex in LaTeX mode', async () => {
      const props = createProps();
      render(<MathNodeView {...props} />);

      const mathContent = screen.getByTestId('node-view-wrapper').querySelectorAll('span');
      fireEvent.click(mathContent[mathContent.length - 1]);

      // Switch to LaTeX mode
      fireEvent.click(screen.getByText('Edit LaTeX'));

      const input = screen.getByPlaceholderText('Enter LaTeX code...');
      expect(input).toHaveValue('\\frac{1}{2}');
    });

    it('shows empty input in expression mode for legacy nodes without originalText', async () => {
      const props = createProps({ attrs: { latex: '\\frac{1}{2}', originalText: '' } });
      render(<MathNodeView {...props} />);

      const mathContent = screen.getByTestId('node-view-wrapper').querySelectorAll('span');
      fireEvent.click(mathContent[mathContent.length - 1]);

      const input = screen.getByPlaceholderText('Describe math in plain English...');
      expect(input).toHaveValue('');
    });
  });

  describe('Closing edit panel', () => {
    it('closes the panel on Escape without making changes', async () => {
      const props = createProps();
      render(<MathNodeView {...props} />);

      const mathContent = screen.getByTestId('node-view-wrapper').querySelectorAll('span');
      fireEvent.click(mathContent[mathContent.length - 1]);

      expect(screen.getByText('Edit Expression')).toBeInTheDocument();

      const input = screen.getByPlaceholderText('Describe math in plain English...');
      fireEvent.keyDown(input, { key: 'Escape' });

      expect(screen.queryByText('Edit Expression')).not.toBeInTheDocument();
      expect(props.updateAttributes).not.toHaveBeenCalled();
    });
  });

  describe('Expression mode submission', () => {
    it('closes panel without API call when text is unchanged', async () => {
      const fetchSpy = vi.spyOn(globalThis, 'fetch');
      const props = createProps();
      render(<MathNodeView {...props} />);

      const mathContent = screen.getByTestId('node-view-wrapper').querySelectorAll('span');
      fireEvent.click(mathContent[mathContent.length - 1]);

      const input = screen.getByPlaceholderText('Describe math in plain English...');
      // Text is already 'one half' (originalText) — press Enter without changing
      fireEvent.keyDown(input, { key: 'Enter' });

      expect(fetchSpy).not.toHaveBeenCalled();
      expect(screen.queryByText('Edit Expression')).not.toBeInTheDocument();
      fetchSpy.mockRestore();
    });

    it('calls API and updates attributes when text is changed', async () => {
      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
        ok: true,
        json: async () => ({ latex: '\\frac{1}{3}' }),
      } as Response);

      const props = createProps();
      render(<MathNodeView {...props} />);

      const mathContent = screen.getByTestId('node-view-wrapper').querySelectorAll('span');
      fireEvent.click(mathContent[mathContent.length - 1]);

      const input = screen.getByPlaceholderText('Describe math in plain English...');
      await userEvent.clear(input);
      await userEvent.type(input, 'one third');
      fireEvent.keyDown(input, { key: 'Enter' });

      await waitFor(() => {
        expect(fetchSpy).toHaveBeenCalledWith('/api/ai/latex', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text: 'one third' }),
        });
      });

      await waitFor(() => {
        expect(props.updateAttributes).toHaveBeenCalledWith({
          latex: '\\frac{1}{3}',
          originalText: 'one third',
        });
      });

      fetchSpy.mockRestore();
    });

    it('shows error and keeps panel open on API failure', async () => {
      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
        ok: false,
      } as Response);

      const props = createProps();
      render(<MathNodeView {...props} />);

      const mathContent = screen.getByTestId('node-view-wrapper').querySelectorAll('span');
      fireEvent.click(mathContent[mathContent.length - 1]);

      const input = screen.getByPlaceholderText('Describe math in plain English...');
      await userEvent.clear(input);
      await userEvent.type(input, 'something new');
      fireEvent.keyDown(input, { key: 'Enter' });

      await waitFor(() => {
        expect(screen.getByText('Failed to convert expression')).toBeInTheDocument();
      });

      // Panel should still be open
      expect(screen.getByText('Edit Expression')).toBeInTheDocument();

      fetchSpy.mockRestore();
    });
  });

  describe('LaTeX mode submission', () => {
    it('updates attributes directly without fetch', async () => {
      const fetchSpy = vi.spyOn(globalThis, 'fetch');
      const props = createProps();
      render(<MathNodeView {...props} />);

      const mathContent = screen.getByTestId('node-view-wrapper').querySelectorAll('span');
      fireEvent.click(mathContent[mathContent.length - 1]);

      // Switch to LaTeX mode
      fireEvent.click(screen.getByText('Edit LaTeX'));

      const input = screen.getByPlaceholderText('Enter LaTeX code...');
      // Use fireEvent.change to avoid userEvent interpreting special characters
      fireEvent.change(input, { target: { value: '\\frac{1}{3}' } });
      fireEvent.keyDown(input, { key: 'Enter' });

      expect(fetchSpy).not.toHaveBeenCalled();
      expect(props.updateAttributes).toHaveBeenCalledWith({ latex: '\\frac{1}{3}' });

      fetchSpy.mockRestore();
    });
  });
});
