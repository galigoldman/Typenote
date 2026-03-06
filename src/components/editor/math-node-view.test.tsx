import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MathNodeView } from './math-node-view';

vi.mock('@/lib/editor/math-api', () => ({
  translateMathToLatex: vi.fn(),
}));

vi.mock('katex', () => ({
  default: {
    renderToString: vi.fn((latex: string) => `<span class="katex">${latex}</span>`),
  },
}));

vi.mock('@tiptap/react', () => ({
  NodeViewWrapper: ({
    children,
    ...props
  }: {
    children: React.ReactNode;
    as?: string;
    className?: string;
  }) => <span {...props}>{children}</span>,
}));

import { translateMathToLatex } from '@/lib/editor/math-api';
const mockedTranslate = vi.mocked(translateMathToLatex);

const mockDispatch = vi.fn();
const mockTr = {};
const mockEditor = {
  view: { dispatch: mockDispatch },
  state: { tr: mockTr },
};

function createProps(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    node: {
      attrs: {
        latex: '',
        naturalLanguage: '',
        ...(overrides.attrs as Record<string, string> | undefined),
      },
    },
    updateAttributes: vi.fn(),
    deleteNode: vi.fn(),
    selected: false,
    editor: mockEditor as never,
    getPos: (() => 0) as never,
    extension: {} as never,
    decorations: [] as never,
    HTMLAttributes: {} as never,
    ...overrides,
  } as never;
}

describe('MathNodeView', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders in edit mode when latex is empty (new node)', () => {
    render(<MathNodeView {...createProps()} />);
    expect(screen.getByPlaceholderText('Type math in words...')).toBeInTheDocument();
  });

  it('renders KaTeX output when latex exists', () => {
    render(
      <MathNodeView
        {...createProps({
          attrs: { latex: 'x^2', naturalLanguage: 'x squared' },
        })}
      />
    );
    // Should show rendered content, not input
    expect(screen.queryByPlaceholderText('Type math in words...')).not.toBeInTheDocument();
  });

  it('deletes node on Escape when new (empty latex)', () => {
    const props = createProps();
    render(<MathNodeView {...props} />);
    const input = screen.getByPlaceholderText('Type math in words...');
    fireEvent.keyDown(input, { key: 'Escape' });
    expect((props as { deleteNode: ReturnType<typeof vi.fn> }).deleteNode).toHaveBeenCalled();
  });

  it('calls API and updates attrs on Enter in NL mode', async () => {
    mockedTranslate.mockResolvedValue('x^2 + 1');
    const props = createProps();
    render(<MathNodeView {...props} />);

    const input = screen.getByPlaceholderText('Type math in words...');
    await userEvent.type(input, 'x squared plus 1');
    fireEvent.keyDown(input, { key: 'Enter' });

    await waitFor(() => {
      expect(mockedTranslate).toHaveBeenCalledWith('x squared plus 1');
      expect(
        (props as { updateAttributes: ReturnType<typeof vi.fn> }).updateAttributes
      ).toHaveBeenCalledWith({
        latex: 'x^2 + 1',
        naturalLanguage: 'x squared plus 1',
      });
    });
  });

  it('shows error message on API failure', async () => {
    mockedTranslate.mockRejectedValue(new Error('API error'));
    render(<MathNodeView {...createProps()} />);

    const input = screen.getByPlaceholderText('Type math in words...');
    await userEvent.type(input, 'something');
    fireEvent.keyDown(input, { key: 'Enter' });

    await waitFor(() => {
      expect(screen.getByText('API error')).toBeInTheDocument();
    });
  });

  it('toggles between NL and LaTeX mode', async () => {
    render(<MathNodeView {...createProps()} />);

    const toggleBtn = screen.getByText('NL');
    await userEvent.click(toggleBtn);

    expect(screen.getByText('TeX')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Raw LaTeX...')).toBeInTheDocument();
  });

  it('directly sets latex in LaTeX mode without API call', async () => {
    const props = createProps();
    render(<MathNodeView {...props} />);

    // Switch to LaTeX mode
    await userEvent.click(screen.getByText('NL'));

    const input = screen.getByPlaceholderText('Raw LaTeX...');
    await userEvent.type(input, 'x^2');
    fireEvent.keyDown(input, { key: 'Enter' });

    expect(mockedTranslate).not.toHaveBeenCalled();
    expect(
      (props as { updateAttributes: ReturnType<typeof vi.fn> }).updateAttributes
    ).toHaveBeenCalledWith({
      latex: 'x^2',
      naturalLanguage: '',
    });
  });

  it('deletes node on Enter with empty input when new', () => {
    const props = createProps();
    render(<MathNodeView {...props} />);
    const input = screen.getByPlaceholderText('Type math in words...');
    fireEvent.keyDown(input, { key: 'Enter' });
    expect((props as { deleteNode: ReturnType<typeof vi.fn> }).deleteNode).toHaveBeenCalled();
  });
});
