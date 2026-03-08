# Inline Math Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add inline math expressions to the TipTap editor — user types `$`, enters natural language, AI converts to LaTeX, KaTeX renders inline, persisted in document JSON.

**Architecture:** Single custom TipTap `InlineMath` node with a React NodeView component managing editing/display states. API route uses Vercel AI SDK + Google Gemini for NL→LaTeX translation. Content persists via existing auto-save flow (TipTap JSON → Supabase JSONB).

**Tech Stack:** TipTap 3, React 19, Next.js 16, Vercel AI SDK (`ai`), Google Gemini (`@ai-sdk/google`), KaTeX, Vitest

---

### Task 1: Install Dependencies & Setup Branch

**Files:**

- Modify: `package.json`
- Modify: `src/app/globals.css:1`

**Step 1: Create feature branch**

```bash
git checkout main && git checkout -b feat/inline-math-v2
```

**Step 2: Install dependencies**

```bash
pnpm add ai @ai-sdk/google katex
pnpm add -D @types/katex
```

**Step 3: Import KaTeX CSS in globals.css**

Add at top of `src/app/globals.css` (after existing imports, before `@custom-variant`):

```css
@import 'katex/dist/katex.min.css';
```

**Step 4: Add env var**

Create/update `.env.local` with:

```
GOOGLE_GENERATIVE_AI_API_KEY=AIzaSyCWvHgmhNJOJfa0DrFa8g6pbvwnJK5wTGg
```

**Step 5: Verify build isn't broken**

Run: `pnpm build` or `pnpm dev` — confirm no errors from new imports.

**Step 6: Commit**

```bash
git add package.json pnpm-lock.yaml src/app/globals.css .env.local
git commit -m "chore: install ai, katex dependencies and import katex css"
```

---

### Task 2: TipTap InlineMath Node Extension

**Files:**

- Create: `src/lib/editor/inline-math.ts`
- Test: `src/lib/editor/inline-math.test.ts`

**Step 1: Write the failing test**

Create `src/lib/editor/inline-math.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { Editor } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import { InlineMath } from './inline-math';

function createEditor(content?: Record<string, unknown>) {
  return new Editor({
    extensions: [StarterKit, InlineMath],
    content,
  });
}

describe('InlineMath extension', () => {
  it('registers the inlineMath node type', () => {
    const editor = createEditor();
    const nodeType = editor.schema.nodes.inlineMath;
    expect(nodeType).toBeDefined();
    expect(nodeType.isInline).toBe(true);
    expect(nodeType.isAtom).toBe(true);
    editor.destroy();
  });

  it('defines latex and naturalLanguage attributes with defaults', () => {
    const editor = createEditor();
    const nodeType = editor.schema.nodes.inlineMath;
    const attrs = nodeType.spec.attrs;
    expect(attrs).toHaveProperty('latex');
    expect(attrs).toHaveProperty('naturalLanguage');
    editor.destroy();
  });

  it('can insert an inlineMath node via insertContent', () => {
    const editor = createEditor();
    editor.commands.insertContent({
      type: 'inlineMath',
      attrs: { latex: 'x^2', naturalLanguage: 'x squared' },
    });

    const json = editor.getJSON();
    const mathNode = json.content?.[0]?.content?.find(
      (n: { type: string }) => n.type === 'inlineMath',
    );
    expect(mathNode).toBeDefined();
    expect(mathNode?.attrs?.latex).toBe('x^2');
    expect(mathNode?.attrs?.naturalLanguage).toBe('x squared');
    editor.destroy();
  });
});
```

**Step 2: Run test to verify it fails**

Run: `pnpm vitest run src/lib/editor/inline-math.test.ts`
Expected: FAIL — `./inline-math` module not found

**Step 3: Write the InlineMath extension**

Create `src/lib/editor/inline-math.ts`:

```typescript
import { Node, mergeAttributes } from '@tiptap/core';
import { ReactNodeViewRenderer } from '@tiptap/react';
import type { Component } from 'react';

export interface InlineMathOptions {
  HTMLAttributes: Record<string, unknown>;
}

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    inlineMath: {
      insertMath: () => ReturnType;
    };
  }
}

export const InlineMath = Node.create<InlineMathOptions>({
  name: 'inlineMath',
  group: 'inline',
  inline: true,
  atom: true,

  addAttributes() {
    return {
      latex: { default: '' },
      naturalLanguage: { default: '' },
    };
  },

  parseHTML() {
    return [{ tag: 'span[data-type="inline-math"]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      'span',
      mergeAttributes({ 'data-type': 'inline-math' }, HTMLAttributes),
    ];
  },

  addCommands() {
    return {
      insertMath:
        () =>
        ({ commands }) => {
          return commands.insertContent({
            type: this.name,
            attrs: { latex: '', naturalLanguage: '' },
          });
        },
    };
  },

  addKeyboardShortcuts() {
    return {
      $: () => {
        this.editor.commands.insertMath();
        return true;
      },
    };
  },

  // NodeView will be added in Task 4 after MathNodeView is created
});
```

> **Note:** The `addNodeView()` method is intentionally omitted here. It will be added in Task 4 after `MathNodeView` is created, to avoid circular dependency issues. For now the node works headlessly for tests.

**Step 4: Run test to verify it passes**

Run: `pnpm vitest run src/lib/editor/inline-math.test.ts`
Expected: PASS (3 tests)

**Step 5: Commit**

```bash
git add src/lib/editor/inline-math.ts src/lib/editor/inline-math.test.ts
git commit -m "feat: add InlineMath TipTap node extension with tests"
```

---

### Task 3: Math Translation API Route

**Files:**

- Create: `src/app/api/math/translate/route.ts`
- Create: `src/lib/editor/math-api.ts`
- Test: `src/app/api/math/translate/route.test.ts`
- Test: `src/lib/editor/math-api.test.ts`

**Step 1: Write the failing API route test**

Create `src/app/api/math/translate/route.test.ts`:

```typescript
import { describe, it, expect, vi } from 'vitest';

// Mock the ai module before importing the route
vi.mock('ai', () => ({
  generateText: vi.fn(),
}));

vi.mock('@ai-sdk/google', () => ({
  google: vi.fn(() => 'mocked-model'),
}));

import { POST } from './route';
import { generateText } from 'ai';

describe('POST /api/math/translate', () => {
  it('returns latex for valid input', async () => {
    vi.mocked(generateText).mockResolvedValue({
      text: '\\sqrt{x + 5}',
    } as ReturnType<typeof generateText> extends Promise<infer T> ? T : never);

    const request = new Request('http://localhost/api/math/translate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: 'square root of x plus 5' }),
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.latex).toBe('\\sqrt{x + 5}');
  });

  it('returns 400 when text is missing', async () => {
    const request = new Request('http://localhost/api/math/translate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });

    const response = await POST(request);
    expect(response.status).toBe(400);
  });

  it('returns 500 when AI fails', async () => {
    vi.mocked(generateText).mockRejectedValue(new Error('AI error'));

    const request = new Request('http://localhost/api/math/translate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: 'some math' }),
    });

    const response = await POST(request);
    expect(response.status).toBe(500);
  });

  it('strips accidental LaTeX delimiters from AI response', async () => {
    vi.mocked(generateText).mockResolvedValue({
      text: '$$\\frac{a}{b}$$',
    } as ReturnType<typeof generateText> extends Promise<infer T> ? T : never);

    const request = new Request('http://localhost/api/math/translate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: 'a divided by b' }),
    });

    const response = await POST(request);
    const data = await response.json();

    expect(data.latex).toBe('\\frac{a}{b}');
  });
});
```

**Step 2: Run test to verify it fails**

Run: `pnpm vitest run src/app/api/math/translate/route.test.ts`
Expected: FAIL — module not found

**Step 3: Write the API route**

Create `src/app/api/math/translate/route.ts`:

````typescript
import { generateText } from 'ai';
import { google } from '@ai-sdk/google';
import { NextResponse } from 'next/server';

const SYSTEM_PROMPT = `You are a math expression translator. Convert natural language math descriptions into LaTeX notation.

Rules:
- Output ONLY the raw LaTeX expression
- Do NOT wrap in delimiters like $, $$, \\[, \\], or backticks
- Do NOT include any explanation or markdown
- Do NOT include \\text{} unless the user explicitly asks for text in the formula
- Handle any input language (English, Hebrew, Arabic, etc.)

Examples:
- "square root of x plus 5" → \\sqrt{x + 5}
- "x squared plus y squared equals z squared" → x^2 + y^2 = z^2
- "integral from 0 to infinity of e to the minus x dx" → \\int_0^{\\infty} e^{-x} dx
- "sum from i equals 1 to n of i squared" → \\sum_{i=1}^{n} i^2`;

function sanitizeLatex(text: string): string {
  let result = text.trim();
  // Strip markdown code fences
  result = result.replace(/^```(?:latex)?\n?/g, '').replace(/\n?```$/g, '');
  // Strip $$ delimiters
  result = result.replace(/^\$\$\s*/, '').replace(/\s*\$\$$/g, '');
  // Strip single $ delimiters
  result = result.replace(/^\$\s*/, '').replace(/\s*\$$/g, '');
  // Strip \[ \] delimiters
  result = result.replace(/^\\\[\s*/, '').replace(/\s*\\\]$/g, '');
  // Strip \( \) delimiters
  result = result.replace(/^\\\(\s*/, '').replace(/\s*\\\)$/g, '');
  return result.trim();
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { text } = body;

    if (!text || typeof text !== 'string' || text.trim().length === 0) {
      return NextResponse.json(
        { error: 'Missing or empty "text" field' },
        { status: 400 },
      );
    }

    const { text: latex } = await generateText({
      model: google('gemini-2.5-flash'),
      system: SYSTEM_PROMPT,
      prompt: text.trim(),
    });

    return NextResponse.json({ latex: sanitizeLatex(latex) });
  } catch (error) {
    console.error('Math translation error:', error);
    return NextResponse.json(
      { error: 'Failed to translate math expression' },
      { status: 500 },
    );
  }
}
````

**Step 4: Run API route test to verify it passes**

Run: `pnpm vitest run src/app/api/math/translate/route.test.ts`
Expected: PASS (4 tests)

**Step 5: Write the failing client API test**

Create `src/lib/editor/math-api.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { translateMathToLatex } from './math-api';

describe('translateMathToLatex', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('returns latex on success', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ latex: '\\sqrt{x}' }),
    });

    const result = await translateMathToLatex('square root of x');
    expect(result).toBe('\\sqrt{x}');
    expect(fetch).toHaveBeenCalledWith('/api/math/translate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: 'square root of x' }),
    });
  });

  it('throws on API error', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      json: () => Promise.resolve({ error: 'Bad request' }),
    });

    await expect(translateMathToLatex('')).rejects.toThrow('Bad request');
  });

  it('throws on network error', async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error('Network error'));

    await expect(translateMathToLatex('test')).rejects.toThrow('Network error');
  });
});
```

**Step 6: Run to verify it fails**

Run: `pnpm vitest run src/lib/editor/math-api.test.ts`
Expected: FAIL — module not found

**Step 7: Write the client API function**

Create `src/lib/editor/math-api.ts`:

```typescript
export async function translateMathToLatex(text: string): Promise<string> {
  const response = await fetch('/api/math/translate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text }),
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.error || 'Failed to translate math expression');
  }

  return data.latex;
}
```

**Step 8: Run client API test to verify it passes**

Run: `pnpm vitest run src/lib/editor/math-api.test.ts`
Expected: PASS (3 tests)

**Step 9: Run all tests to verify nothing is broken**

Run: `pnpm vitest run`
Expected: All tests pass

**Step 10: Commit**

```bash
git add src/app/api/math/translate/route.ts src/app/api/math/translate/route.test.ts src/lib/editor/math-api.ts src/lib/editor/math-api.test.ts
git commit -m "feat: add math translation API route and client function"
```

---

### Task 4: MathNodeView React Component

**Files:**

- Create: `src/components/editor/math-node-view.tsx`
- Modify: `src/lib/editor/inline-math.ts` (add `addNodeView`)
- Test: `src/components/editor/math-node-view.test.tsx`

**Step 1: Write the failing component test**

Create `src/components/editor/math-node-view.test.tsx`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MathNodeView } from './math-node-view';

// Mock KaTeX
vi.mock('katex', () => ({
  default: {
    renderToString: vi.fn((latex: string) => `<span>rendered:${latex}</span>`),
  },
}));

// Mock math-api
vi.mock('@/lib/editor/math-api', () => ({
  translateMathToLatex: vi.fn(),
}));

import { translateMathToLatex } from '@/lib/editor/math-api';

// Helper to create mock NodeView props
function createMockProps(attrs: { latex?: string; naturalLanguage?: string } = {}) {
  return {
    node: {
      attrs: {
        latex: attrs.latex ?? '',
        naturalLanguage: attrs.naturalLanguage ?? '',
      },
    },
    updateAttributes: vi.fn(),
    deleteNode: vi.fn(),
    selected: false,
  };
}

describe('MathNodeView', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders in editing mode when latex is empty (new node)', () => {
    const props = createMockProps();
    render(<MathNodeView {...props} />);
    expect(screen.getByRole('textbox')).toBeInTheDocument();
  });

  it('renders KaTeX output when latex is present (display mode)', () => {
    const props = createMockProps({ latex: 'x^2', naturalLanguage: 'x squared' });
    render(<MathNodeView {...props} />);
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
    expect(screen.getByText(/rendered:x\^2/)).toBeInTheDocument();
  });

  it('calls deleteNode on Escape when creating new node (empty latex)', () => {
    const props = createMockProps();
    render(<MathNodeView {...props} />);
    fireEvent.keyDown(screen.getByRole('textbox'), { key: 'Escape' });
    expect(props.deleteNode).toHaveBeenCalled();
  });

  it('reverts to display on Escape when editing existing node', async () => {
    const props = createMockProps({ latex: 'x^2', naturalLanguage: 'x squared' });
    render(<MathNodeView {...props} />);

    // Click to edit
    fireEvent.click(screen.getByText(/rendered:x\^2/));
    expect(screen.getByRole('textbox')).toBeInTheDocument();

    // Escape should revert to display
    fireEvent.keyDown(screen.getByRole('textbox'), { key: 'Escape' });
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
  });

  it('calls AI and updates attributes on Enter in NL mode', async () => {
    vi.mocked(translateMathToLatex).mockResolvedValue('\\sqrt{x}');
    const props = createMockProps();
    render(<MathNodeView {...props} />);

    const input = screen.getByRole('textbox');
    await userEvent.type(input, 'square root of x');
    fireEvent.keyDown(input, { key: 'Enter' });

    await waitFor(() => {
      expect(translateMathToLatex).toHaveBeenCalledWith('square root of x');
      expect(props.updateAttributes).toHaveBeenCalledWith({
        latex: '\\sqrt{x}',
        naturalLanguage: 'square root of x',
      });
    });
  });

  it('skips AI call when NL text is unchanged on re-edit', async () => {
    const props = createMockProps({ latex: 'x^2', naturalLanguage: 'x squared' });
    render(<MathNodeView {...props} />);

    // Click to edit
    fireEvent.click(screen.getByText(/rendered:x\^2/));

    // Press Enter without changing text
    const input = screen.getByRole('textbox');
    fireEvent.keyDown(input, { key: 'Enter' });

    expect(translateMathToLatex).not.toHaveBeenCalled();
  });

  it('shows error inline when AI fails', async () => {
    vi.mocked(translateMathToLatex).mockRejectedValue(new Error('AI failed'));
    const props = createMockProps();
    render(<MathNodeView {...props} />);

    const input = screen.getByRole('textbox');
    await userEvent.type(input, 'some math');
    fireEvent.keyDown(input, { key: 'Enter' });

    await waitFor(() => {
      expect(screen.getByText(/AI failed/i)).toBeInTheDocument();
    });
  });

  it('toggles to LaTeX mode and submits without AI', async () => {
    const props = createMockProps({ latex: 'x^2', naturalLanguage: 'x squared' });
    render(<MathNodeView {...props} />);

    // Click to edit
    fireEvent.click(screen.getByText(/rendered:x\^2/));

    // Toggle to LaTeX mode
    fireEvent.click(screen.getByRole('button', { name: /latex/i }));

    // Input should now show the latex value
    const input = screen.getByRole('textbox');
    await userEvent.clear(input);
    await userEvent.type(input, 'y^3');
    fireEvent.keyDown(input, { key: 'Enter' });

    expect(translateMathToLatex).not.toHaveBeenCalled();
    expect(props.updateAttributes).toHaveBeenCalledWith({
      latex: 'y^3',
      naturalLanguage: 'x squared',
    });
  });
});
```

**Step 2: Run test to verify it fails**

Run: `pnpm vitest run src/components/editor/math-node-view.test.tsx`
Expected: FAIL — module not found

**Step 3: Write the MathNodeView component**

Create `src/components/editor/math-node-view.tsx`:

```tsx
'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { NodeViewWrapper } from '@tiptap/react';
import katex from 'katex';
import { translateMathToLatex } from '@/lib/editor/math-api';

interface MathNodeViewProps {
  node: { attrs: { latex: string; naturalLanguage: string } };
  updateAttributes: (
    attrs: Partial<{ latex: string; naturalLanguage: string }>,
  ) => void;
  deleteNode: () => void;
  selected: boolean;
}

type EditMode = 'nl' | 'latex';

export function MathNodeView({
  node,
  updateAttributes,
  deleteNode,
  selected,
}: MathNodeViewProps) {
  const { latex, naturalLanguage } = node.attrs;
  const isNew = !latex;

  const [isEditing, setIsEditing] = useState(isNew);
  const [mode, setMode] = useState<EditMode>('nl');
  const [inputValue, setInputValue] = useState(isNew ? '' : naturalLanguage);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isEditing]);

  const handleSubmit = useCallback(async () => {
    const value = inputValue.trim();
    if (!value) return;

    if (mode === 'latex') {
      updateAttributes({ latex: value, naturalLanguage });
      setIsEditing(false);
      setError(null);
      return;
    }

    // NL mode: skip AI if text unchanged
    if (value === naturalLanguage && latex) {
      setIsEditing(false);
      setError(null);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const result = await translateMathToLatex(value);
      updateAttributes({ latex: result, naturalLanguage: value });
      setIsEditing(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Translation failed');
    } finally {
      setLoading(false);
    }
  }, [inputValue, mode, naturalLanguage, latex, updateAttributes]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        e.stopPropagation();
        handleSubmit();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        if (isNew) {
          deleteNode();
        } else {
          setIsEditing(false);
          setInputValue(naturalLanguage);
          setError(null);
          setMode('nl');
        }
      }
    },
    [handleSubmit, isNew, deleteNode, naturalLanguage],
  );

  const handleToggleMode = useCallback(() => {
    const newMode = mode === 'nl' ? 'latex' : 'nl';
    setMode(newMode);
    setInputValue(newMode === 'nl' ? naturalLanguage : latex);
    setError(null);
  }, [mode, naturalLanguage, latex]);

  const handleClickDisplay = useCallback(() => {
    setIsEditing(true);
    setMode('nl');
    setInputValue(naturalLanguage);
    setError(null);
  }, [naturalLanguage]);

  if (isEditing) {
    return (
      <NodeViewWrapper as="span" className="inline-math-editor">
        <span className="inline-flex items-center gap-1 rounded border border-border bg-muted px-1.5 py-0.5 text-sm">
          <input
            ref={inputRef}
            type="text"
            role="textbox"
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={mode === 'nl' ? 'Describe math...' : 'LaTeX...'}
            disabled={loading}
            className="bg-transparent border-none outline-none min-w-[120px]"
          />
          {!isNew && (
            <button
              type="button"
              onClick={handleToggleMode}
              className="text-xs px-1 py-0.5 rounded bg-secondary text-secondary-foreground hover:bg-secondary/80"
              aria-label={mode === 'nl' ? 'Switch to LaTeX' : 'Switch to NL'}
            >
              {mode === 'nl' ? 'LaTeX' : 'NL'}
            </button>
          )}
          {loading && (
            <span className="text-xs text-muted-foreground">...</span>
          )}
          {error && <span className="text-xs text-destructive">{error}</span>}
        </span>
      </NodeViewWrapper>
    );
  }

  // Display mode — render KaTeX
  const html = katex.renderToString(latex, {
    throwOnError: false,
    displayMode: false,
  });

  return (
    <NodeViewWrapper as="span" className="inline-math-display">
      <span
        role="button"
        tabIndex={0}
        onClick={handleClickDisplay}
        onKeyDown={(e) => e.key === 'Enter' && handleClickDisplay()}
        className={`cursor-pointer rounded px-0.5 hover:bg-accent ${selected ? 'bg-accent' : ''}`}
        dangerouslySetInnerHTML={{ __html: html }}
      />
    </NodeViewWrapper>
  );
}
```

**Step 4: Wire up NodeView in the InlineMath extension**

Add to `src/lib/editor/inline-math.ts`, inside `Node.create({})`, after `addKeyboardShortcuts()`:

```typescript
  addNodeView() {
    return ReactNodeViewRenderer(
      MathNodeView as unknown as Component,
    );
  },
```

And add the import at the top of `src/lib/editor/inline-math.ts`:

```typescript
import { MathNodeView } from '@/components/editor/math-node-view';
```

> **Important:** The existing headless tests (Task 2) don't use React rendering, so they still pass. The `ReactNodeViewRenderer` only activates when the editor is mounted in a React tree.

**Step 5: Run component test to verify it passes**

Run: `pnpm vitest run src/components/editor/math-node-view.test.tsx`
Expected: PASS (7 tests)

**Step 6: Run all tests**

Run: `pnpm vitest run`
Expected: All tests pass

**Step 7: Commit**

```bash
git add src/components/editor/math-node-view.tsx src/components/editor/math-node-view.test.tsx src/lib/editor/inline-math.ts
git commit -m "feat: add MathNodeView component with NL/LaTeX editing modes"
```

---

### Task 5: Register Extension in Editor & Add Toolbar Button

**Files:**

- Modify: `src/components/editor/tiptap-editor.tsx:1-16,80-101`
- Modify: `src/components/editor/editor-toolbar.tsx:1-23,213-237`

**Step 1: Register InlineMath in tiptap-editor.tsx**

Add import at line 16 (after AutoDirection import):

```typescript
import { InlineMath } from '@/lib/editor/inline-math';
```

Add `InlineMath` to the extensions array (after `AutoDirection` at line 100):

```typescript
      AutoDirection,
      InlineMath,
```

**Step 2: Add toolbar button in editor-toolbar.tsx**

Add `Sigma` to the lucide-react import (line 22, after `Quote`):

```typescript
import {
  // ... existing icons ...
  Quote,
  Sigma,
} from 'lucide-react';
```

Add the math button after the Blockquote button (after line 236, before the closing `</div>`):

```tsx
<ToolbarButton
  onClick={() => editor.chain().focus().insertMath().run()}
  icon={<Sigma />}
  label="Math expression"
  shortcut="$"
/>
```

**Step 3: Verify the app builds**

Run: `pnpm build`
Expected: Build succeeds

**Step 4: Run all tests**

Run: `pnpm vitest run`
Expected: All tests pass

**Step 5: Commit**

```bash
git add src/components/editor/tiptap-editor.tsx src/components/editor/editor-toolbar.tsx
git commit -m "feat: register InlineMath extension and add toolbar math button"
```

---

### Task 6: JSON Roundtrip & Persistence Tests

**Files:**

- Modify: `src/lib/editor/inline-math-roundtrip.test.ts` (already exists as untracked)
- Create: `src/lib/editor/inline-math-sync.test.ts`

**Step 1: Update the existing roundtrip test**

The file at `src/lib/editor/inline-math-roundtrip.test.ts` already has good roundtrip tests. Run it to confirm it passes with the new extension:

Run: `pnpm vitest run src/lib/editor/inline-math-roundtrip.test.ts`
Expected: PASS (2 tests) — because the `InlineMath` extension from Task 2 matches what the test imports

**Step 2: Write the sync persistence test**

Create `src/lib/editor/inline-math-sync.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { Editor } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import { InlineMath } from './inline-math';

function createEditor(content?: Record<string, unknown>) {
  return new Editor({
    extensions: [StarterKit, InlineMath],
    content,
  });
}

describe('InlineMath persistence (save/load simulation)', () => {
  it('math node survives full save → load cycle', () => {
    // 1. Create editor, insert math node
    const editor = createEditor();
    editor.commands.insertContent({
      type: 'paragraph',
      content: [
        { type: 'text', text: 'Energy formula: ' },
        {
          type: 'inlineMath',
          attrs: {
            latex: 'E = mc^2',
            naturalLanguage: 'energy equals mass times speed of light squared',
          },
        },
        { type: 'text', text: ' is famous.' },
      ],
    });

    // 2. Simulate save: getJSON (this is what updateDocumentContent sends to Supabase)
    const savedContent = editor.getJSON();

    // 3. Simulate what Supabase returns: JSON.parse(JSON.stringify()) mimics DB roundtrip
    const fromDb = JSON.parse(JSON.stringify(savedContent));

    // 4. Simulate page reload: new editor with content from DB
    const reloadedEditor = createEditor(fromDb);
    const reloadedJson = reloadedEditor.getJSON();

    // 5. Find the math node in reloaded document
    const paragraph = reloadedJson.content?.[0];
    const mathNode = paragraph?.content?.find(
      (n: { type: string }) => n.type === 'inlineMath',
    );

    // 6. Verify attrs survived the full cycle
    expect(mathNode).toBeDefined();
    expect(mathNode?.attrs?.latex).toBe('E = mc^2');
    expect(mathNode?.attrs?.naturalLanguage).toBe(
      'energy equals mass times speed of light squared',
    );

    // 7. Verify surrounding text is intact
    const textNodes = paragraph?.content?.filter(
      (n: { type: string }) => n.type === 'text',
    );
    expect(textNodes?.[0]?.text).toBe('Energy formula: ');
    expect(textNodes?.[1]?.text).toBe(' is famous.');

    editor.destroy();
    reloadedEditor.destroy();
  });

  it('math node survives realtime sync (setContent with emitUpdate: false)', () => {
    const editor = createEditor();
    editor.commands.insertContent({
      type: 'inlineMath',
      attrs: { latex: '\\pi r^2', naturalLanguage: 'pi r squared' },
    });

    const savedContent = editor.getJSON();

    // Simulate realtime sync: another editor receives content via setContent
    const remoteEditor = createEditor();
    remoteEditor.commands.setContent(
      savedContent as Record<string, unknown>,
      // @ts-expect-error - TipTap accepts this option but types may not reflect it
      { emitUpdate: false },
    );

    // Verify the synced editor has the math node
    let foundLatex = '';
    let foundNL = '';
    remoteEditor.state.doc.descendants((node) => {
      if (node.type.name === 'inlineMath') {
        foundLatex = node.attrs.latex;
        foundNL = node.attrs.naturalLanguage;
      }
    });

    expect(foundLatex).toBe('\\pi r^2');
    expect(foundNL).toBe('pi r squared');

    editor.destroy();
    remoteEditor.destroy();
  });

  it('multiple math nodes in a document all survive persistence', () => {
    const editor = createEditor();
    editor.commands.insertContent({
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [
            {
              type: 'inlineMath',
              attrs: {
                latex: 'a^2 + b^2 = c^2',
                naturalLanguage: 'pythagorean theorem',
              },
            },
            { type: 'text', text: ' and ' },
            {
              type: 'inlineMath',
              attrs: {
                latex: 'e^{i\\pi} + 1 = 0',
                naturalLanguage: 'euler identity',
              },
            },
          ],
        },
      ],
    });

    const saved = editor.getJSON();
    const fromDb = JSON.parse(JSON.stringify(saved));
    const reloaded = createEditor(fromDb);

    const mathNodes: Array<{ latex: string; naturalLanguage: string }> = [];
    reloaded.state.doc.descendants((node) => {
      if (node.type.name === 'inlineMath') {
        mathNodes.push({
          latex: node.attrs.latex,
          naturalLanguage: node.attrs.naturalLanguage,
        });
      }
    });

    expect(mathNodes).toHaveLength(2);
    expect(mathNodes[0].latex).toBe('a^2 + b^2 = c^2');
    expect(mathNodes[1].latex).toBe('e^{i\\pi} + 1 = 0');

    editor.destroy();
    reloaded.destroy();
  });
});
```

**Step 3: Run persistence tests**

Run: `pnpm vitest run src/lib/editor/inline-math-sync.test.ts src/lib/editor/inline-math-roundtrip.test.ts`
Expected: PASS (all tests)

**Step 4: Run full test suite**

Run: `pnpm vitest run`
Expected: All tests pass

**Step 5: Commit**

```bash
git add src/lib/editor/inline-math-roundtrip.test.ts src/lib/editor/inline-math-sync.test.ts
git commit -m "test: add roundtrip and sync persistence tests for InlineMath"
```

---

### Task 7: Final Verification & Lint

**Step 1: Run linter**

Run: `pnpm lint`
Expected: No errors. Fix any that appear.

**Step 2: Run formatter**

Run: `pnpm format:check`
If failures: `pnpm format`

**Step 3: Run full test suite one final time**

Run: `pnpm vitest run`
Expected: All tests pass

**Step 4: Run build**

Run: `pnpm build`
Expected: Build succeeds

**Step 5: Commit any fixes**

```bash
git add -A
git commit -m "style: fix lint and formatting"
```

**Step 6: Manual smoke test**

Start dev server: `pnpm dev`

1. Open a document in the editor
2. Type `$` — verify input box appears inline
3. Type "square root of x plus 5" → press Enter → verify KaTeX renders `√(x+5)`
4. Click the rendered expression → verify input reopens with original text
5. Click "LaTeX" toggle → verify raw LaTeX shown in input
6. Press Escape → verify it reverts
7. Click the Σ toolbar button → verify input box appears
8. Refresh the page → verify math expression is still rendered (not an input box)

---

## Dependency Graph

```
Task 1 (deps & branch)
  └→ Task 2 (InlineMath extension)
       └→ Task 3 (API route + client) — can run in parallel with Task 2
       └→ Task 4 (MathNodeView component) — depends on Tasks 2 & 3
            └→ Task 5 (register in editor + toolbar) — depends on Task 4
                 └→ Task 6 (roundtrip + sync tests) — depends on Task 5
                      └→ Task 7 (final verification) — depends on Task 6
```

Tasks 2 and 3 are independent and can be implemented in parallel.
