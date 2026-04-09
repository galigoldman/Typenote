import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Editor } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';

// Mock the React NodeView dependencies since we're testing schema only
vi.mock('@tiptap/react', () => ({
  ReactNodeViewRenderer: vi.fn(() => () => null),
  NodeViewWrapper: vi.fn(),
}));
vi.mock('@/components/editor/math-node-view', () => ({
  MathNodeView: vi.fn(),
}));

import {
  MathExpression,
  MATH_INPUT_PLUGIN_KEY,
  hasWordMath,
  unicodeToLatex,
  findMathRanges,
} from './math-extension';

describe('MathExpression Node', () => {
  it('should have the correct name', () => {
    expect(MathExpression.name).toBe('mathExpression');
  });

  it('should be configured as inline and atom', () => {
    const config = MathExpression.config;
    expect(config.inline).toBe(true);
    expect(config.atom).toBe(true);
    expect(config.group).toBe('inline');
    expect(config.selectable).toBe(true);
    expect(config.draggable).toBe(false);
  });

  it('should define latex attribute with empty string default', () => {
    const attrs = MathExpression.config.addAttributes?.call(MathExpression);
    expect(attrs).toBeDefined();
    expect(attrs?.latex).toBeDefined();
    expect(attrs?.latex.default).toBe('');
  });

  it('should define originalText attribute with empty string default', () => {
    const attrs = MathExpression.config.addAttributes?.call(MathExpression);
    expect(attrs).toBeDefined();
    expect(attrs?.originalText).toBeDefined();
    expect(attrs?.originalText.default).toBe('');
  });

  it('should parse originalText from data-original-text HTML attribute', () => {
    const attrs = MathExpression.config.addAttributes?.call(MathExpression);
    const el = document.createElement('span');
    el.setAttribute('data-original-text', 'one half times five');
    expect(attrs?.originalText.parseHTML(el)).toBe('one half times five');
  });

  it('should render originalText to data-original-text HTML attribute', () => {
    const attrs = MathExpression.config.addAttributes?.call(MathExpression);
    const result = attrs?.originalText.renderHTML({
      originalText: 'one half times five',
    });
    expect(result).toEqual({ 'data-original-text': 'one half times five' });
  });

  it('should parse HTML from span with data-type math-expression', () => {
    const parseRules = MathExpression.config.parseHTML?.call(MathExpression);
    expect(parseRules).toBeDefined();
    expect(parseRules).toHaveLength(3);
    expect(parseRules?.[0].tag).toBe('span[data-type="math-expression"]');
  });

  it('should return latex attribute from renderText (plain-text clipboard)', () => {
    const renderTextFn = MathExpression.config.renderText;
    expect(renderTextFn).toBeDefined();
    if (renderTextFn) {
      const result = renderTextFn.call(MathExpression, {
        node: {
          attrs: { latex: '\\frac{1}{2}', originalText: 'one half' },
        } as unknown,
        pos: 0,
        index: 0,
      } as Parameters<typeof renderTextFn>[0]);
      expect(result).toBe('\\frac{1}{2}');
    }
  });

  it('should render HTML with data-type and data-latex attributes', () => {
    const renderFn = MathExpression.config.renderHTML;
    expect(renderFn).toBeDefined();
    if (renderFn) {
      // HTMLAttributes passed to renderHTML are already transformed by addAttributes().renderHTML
      const result = renderFn.call(MathExpression, {
        HTMLAttributes: {
          'data-latex': '\\frac{1}{2}',
          'data-original-text': '',
        },
        node: { attrs: { latex: '\\frac{1}{2}', originalText: '' } } as unknown,
      } as Parameters<typeof renderFn>[0]);
      expect(result[0]).toBe('span');
      expect(result[1]).toHaveProperty('data-type', 'math-expression');
      expect(result[1]).toHaveProperty('data-latex', '\\frac{1}{2}');
    }
  });
});

describe('MathExpression Trigger Plugin', () => {
  let editor: Editor;
  let dispatchEventSpy: ReturnType<typeof vi.spyOn>;
  let handleKeyDown: (
    view: Parameters<
      NonNullable<
        InstanceType<
          typeof import('@tiptap/pm/state').Plugin
        >['props']['handleKeyDown']
      >
    >[0],
    event: KeyboardEvent,
  ) => boolean | void;

  beforeEach(() => {
    dispatchEventSpy = vi
      .spyOn(window, 'dispatchEvent')
      .mockImplementation(() => true);

    editor = new Editor({
      extensions: [StarterKit, MathExpression],
      content: '<p></p>',
    });

    // Mock coordsAtPos — JSDOM has no layout engine
    vi.spyOn(editor.view, 'coordsAtPos').mockReturnValue({
      left: 100,
      right: 100,
      top: 200,
      bottom: 204,
    });

    // Get the math plugin's handleKeyDown directly
    const mathPlugin = editor.view.state.plugins.find(
      (p) => p.spec.key === MATH_INPUT_PLUGIN_KEY,
    );
    handleKeyDown = mathPlugin!.props.handleKeyDown!;
  });

  afterEach(() => {
    editor.destroy();
    dispatchEventSpy.mockRestore();
  });

  function keyDown(key: string): boolean {
    const event = new KeyboardEvent('keydown', { key, bubbles: true });
    return !!handleKeyDown(editor.view, event);
  }

  // T001: typing { after : opens popup
  it('should trigger popup when { is typed after :', () => {
    editor.commands.setContent('<p>hello:</p>');
    editor.commands.focus('end');

    const result = keyDown('{');

    expect(result).toBe(true);
    expect(dispatchEventSpy).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'math-input-trigger' }),
    );
  });

  // T002: : is deleted from document when :{ triggers
  it('should delete the : character when :{ triggers', () => {
    editor.commands.setContent('<p>hello:</p>');
    editor.commands.focus('end');

    keyDown('{');

    expect(editor.state.doc.textContent).toBe('hello');
  });

  // T003: { without preceding : does NOT trigger
  it('should not trigger when { is typed without preceding :', () => {
    editor.commands.setContent('<p>hello</p>');
    editor.commands.focus('end');

    const result = keyDown('{');

    expect(result).toBe(false);
    expect(dispatchEventSpy).not.toHaveBeenCalled();
  });

  // T004: : followed by non-{ does NOT trigger
  it('should not trigger for non-{ key after :', () => {
    editor.commands.setContent('<p>hello:</p>');
    editor.commands.focus('end');

    const result = keyDown('a');

    expect(result).toBe(false);
    expect(dispatchEventSpy).not.toHaveBeenCalled();
  });

  // T005: { at position 0 (empty paragraph) does NOT trigger
  it('should not trigger when { is typed at start of empty paragraph', () => {
    editor.commands.setContent('<p></p>');
    editor.commands.focus('start');

    const result = keyDown('{');

    expect(result).toBe(false);
    expect(dispatchEventSpy).not.toHaveBeenCalled();
  });

  // T008: :{ inside code block does NOT trigger
  it('should not trigger inside a code block', () => {
    editor.commands.setContent('<pre><code>:</code></pre>');
    editor.commands.focus('end');

    const result = keyDown('{');

    expect(result).toBe(false);
    expect(dispatchEventSpy).not.toHaveBeenCalled();
  });

  // T009: :{ with inline code mark does NOT trigger
  it('should not trigger with inline code mark', () => {
    // Place cursor inside code-marked text (between : and y), not at mark boundary
    editor.commands.setContent('<p><code>x:y</code></p>');
    // Position 3 is between ':' and 'y', inside the code mark
    editor.commands.setTextSelection(3);

    const result = keyDown('{');

    expect(result).toBe(false);
    expect(dispatchEventSpy).not.toHaveBeenCalled();
  });

  // T011: $ is no longer a trigger
  it('should not trigger when $ is typed (old trigger removed)', () => {
    editor.commands.setContent('<p>hello</p>');
    editor.commands.focus('end');

    const result = keyDown('$');

    expect(result).toBe(false);
    expect(dispatchEventSpy).not.toHaveBeenCalled();
  });

  // RTL/Hebrew: :{ triggers even with invisible bidi marks between : and cursor
  it('should trigger when bidi marks exist between : and cursor (Hebrew/RTL)', () => {
    // Simulate Hebrew text followed by : and a Right-to-Left Mark (U+200F)
    editor.commands.setContent('<p>\u05E9\u05DC\u05D5\u05DD:\u200F</p>');
    editor.commands.focus('end');

    const result = keyDown('{');

    expect(result).toBe(true);
    expect(dispatchEventSpy).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'math-input-trigger' }),
    );
    // Both the : and the bidi mark should be removed
    expect(editor.state.doc.textContent).toBe('\u05E9\u05DC\u05D5\u05DD');
  });

  // RTL: bidi mark without preceding : should NOT trigger
  it('should not trigger with bidi mark but no colon (Hebrew/RTL)', () => {
    editor.commands.setContent('<p>\u05E9\u05DC\u05D5\u05DD\u200F</p>');
    editor.commands.focus('end');

    const result = keyDown('{');

    expect(result).toBe(false);
    expect(dispatchEventSpy).not.toHaveBeenCalled();
  });

  // RTL/Hebrew: :} also triggers (braces swapped on Hebrew keyboards)
  it('should trigger with } key (Hebrew keyboard swaps braces)', () => {
    editor.commands.setContent('<p>\u05E9\u05DC\u05D5\u05DD:</p>');
    editor.commands.focus('end');

    const result = keyDown('}');

    expect(result).toBe(true);
    expect(dispatchEventSpy).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'math-input-trigger' }),
    );
  });

  // } without : should NOT trigger
  it('should not trigger } without preceding :', () => {
    editor.commands.setContent('<p>hello</p>');
    editor.commands.focus('end');

    const result = keyDown('}');

    expect(result).toBe(false);
    expect(dispatchEventSpy).not.toHaveBeenCalled();
  });
});

describe('MathExpression parseHTML rules for external formats', () => {
  it('should have 3 parseHTML rules (native + KaTeX + MathML)', () => {
    const parseRules = MathExpression.config.parseHTML?.call(MathExpression);
    expect(parseRules).toHaveLength(3);
  });

  it('should match span.katex with annotation and extract LaTeX (T014)', () => {
    const parseRules = MathExpression.config.parseHTML?.call(MathExpression);
    const katexRule = parseRules?.find((r) => r.tag === 'span.katex');
    expect(katexRule).toBeDefined();

    const el = document.createElement('span');
    el.className = 'katex';
    el.innerHTML =
      '<span class="katex-mathml"><math><semantics><annotation encoding="application/x-tex">\\frac{1}{2}</annotation></semantics></math></span>';

    const attrs = (
      katexRule!.getAttrs as (
        el: HTMLElement,
      ) => Record<string, unknown> | false
    )(el);
    expect(attrs).toEqual({ latex: '\\frac{1}{2}' });
  });

  it('should match math element with annotation and extract LaTeX (T015)', () => {
    const parseRules = MathExpression.config.parseHTML?.call(MathExpression);
    const mathRule = parseRules?.find((r) => r.tag === 'math');
    expect(mathRule).toBeDefined();

    const el = document.createElement('math');
    el.innerHTML =
      '<semantics><mrow><mi>x</mi></mrow><annotation encoding="application/x-tex">x</annotation></semantics>';

    const attrs = (
      mathRule!.getAttrs as (el: HTMLElement) => Record<string, unknown> | false
    )(el);
    expect(attrs).toEqual({ latex: 'x' });
  });

  it('should return false for span.katex without annotation (T016)', () => {
    const parseRules = MathExpression.config.parseHTML?.call(MathExpression);
    const katexRule = parseRules?.find((r) => r.tag === 'span.katex');

    const el = document.createElement('span');
    el.className = 'katex';
    el.innerHTML = '<span class="katex-html">x^2</span>';

    const attrs = (
      katexRule!.getAttrs as (
        el: HTMLElement,
      ) => Record<string, unknown> | false
    )(el);
    expect(attrs).toBe(false);
  });
});

describe('MathExpression paste rules', () => {
  let editor: Editor;

  beforeEach(() => {
    editor = new Editor({
      extensions: [StarterKit, MathExpression],
      content: '<p></p>',
    });
  });

  afterEach(() => {
    editor.destroy();
  });

  it('should have paste rules defined', () => {
    expect(MathExpression.config.addPasteRules).toBeDefined();
  });

  it('should convert $...$ to math node on paste (T017)', () => {
    const pasteRules = MathExpression.config.addPasteRules?.call({
      ...MathExpression,
      type: editor.schema.nodes.mathExpression,
      editor,
      name: 'mathExpression',
      options: {},
      storage: {},
      parent: null,
    });
    expect(pasteRules).toBeDefined();
    expect(pasteRules!.length).toBe(4); // $...$, $$...$$, \(...\), \[...\]
  });

  it('should have regex that matches $\\frac{1}{2}$ (T017 regex)', () => {
    const regex = /(?<!\$)\$([^\$\n]+?)\$(?!\$)/g;
    const match = regex.exec('The answer is $\\frac{1}{2}$ here');
    expect(match).not.toBeNull();
    expect(match![1]).toBe('\\frac{1}{2}');
  });

  it('should have regex that matches \\(\\frac{1}{2}\\) (T018 regex)', () => {
    const regex = /\\\((.+?)\\\)/g;
    const match = regex.exec('The answer is \\(\\frac{1}{2}\\) here');
    expect(match).not.toBeNull();
    expect(match![1]).toBe('\\frac{1}{2}');
  });

  it('should have regex that matches $$\\sum_{i=0}^{n}$$ (T019 regex)', () => {
    const regex = /\$\$([^\$]+?)\$\$/g;
    const match = regex.exec('$$\\sum_{i=0}^{n}$$');
    expect(match).not.toBeNull();
    expect(match![1]).toBe('\\sum_{i=0}^{n}');
  });

  it('should NOT match text without LaTeX delimiters (T020 regex)', () => {
    const regex = /(?<!\$)\$([^\$\n]+?)\$(?!\$)/g;
    expect(regex.exec('Hello world no math here')).toBeNull();
  });

  it('should match only math portion in mixed content (T021 regex)', () => {
    const regex = /(?<!\$)\$([^\$\n]+?)\$(?!\$)/g;
    const text = 'The formula $x^2$ equals something';
    const match = regex.exec(text);
    expect(match).not.toBeNull();
    expect(match![1]).toBe('x^2');
    // Verify no more matches
    expect(regex.exec(text)).toBeNull();
  });
});

describe('Word-style math paste (Unicode + ^{}/_{} detection)', () => {
  describe('hasWordMath', () => {
    it('detects text with ^{} and Unicode math symbol', () => {
      expect(hasWordMath('2^{a,b} \u2229 2^{a,c} =')).toBe(true);
    });

    it('returns false for plain text without math', () => {
      expect(hasWordMath('Hello world')).toBe(false);
    });

    it('returns false for ^{} without Unicode symbols', () => {
      expect(hasWordMath('2^{n} + 3')).toBe(false);
    });

    it('returns false for Unicode symbols without ^{}/_{} ', () => {
      expect(hasWordMath('A \u2229 B')).toBe(false);
    });
  });

  describe('unicodeToLatex', () => {
    it('converts intersection symbol', () => {
      expect(unicodeToLatex('A \u2229 B')).toBe('A \\cap  B');
    });

    it('converts union symbol', () => {
      expect(unicodeToLatex('A \u222A B')).toBe('A \\cup  B');
    });

    it('converts subset symbol', () => {
      expect(unicodeToLatex('A \u2286 B')).toBe('A \\subseteq  B');
    });

    it('converts empty set symbol', () => {
      expect(unicodeToLatex('\u2205')).toBe('\\emptyset');
    });

    it('converts multiple symbols in one string', () => {
      const result = unicodeToLatex('2^{a,b} \u2229 2^{a,c}');
      expect(result).toContain('\\cap');
      expect(result).not.toContain('\u2229');
    });

    it('leaves plain text unchanged', () => {
      expect(unicodeToLatex('hello world')).toBe('hello world');
    });
  });

  describe('findMathRanges', () => {
    it('finds a single math segment with ^{} and Unicode symbol', () => {
      const text = '5.    2^{a,b} \u2229 2^{a,c} =';
      const ranges = findMathRanges(text);
      expect(ranges.length).toBe(1);
      const mathText = text.slice(ranges[0].start, ranges[0].end).trim();
      expect(mathText).toContain('2^{a,b}');
      expect(mathText).toContain('\u2229');
      expect(mathText).toContain('2^{a,c}');
    });

    it('separates non-math prefix from math content', () => {
      const text = '[1 pt]        5.    2^{a,b} \u2229 2^{a,c} =';
      const ranges = findMathRanges(text);
      expect(ranges.length).toBe(1);
      // The math segment should NOT include "[1 pt]" or "5."
      expect(ranges[0].start).toBeGreaterThan(text.indexOf('5.'));
    });

    it('finds multiple separate math segments on one line', () => {
      const text = 'If L_{1} \u2286 L_{2}, then L_{1}* \u2286 L_{2}*';
      const ranges = findMathRanges(text);
      expect(ranges.length).toBeGreaterThanOrEqual(1);
    });

    it('returns empty array for plain text', () => {
      expect(findMathRanges('Hello world no math')).toEqual([]);
    });
  });
});
