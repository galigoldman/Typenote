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

import { MathExpression, MATH_INPUT_PLUGIN_KEY } from './math-extension';

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
    expect(parseRules).toHaveLength(1);
    expect(parseRules?.[0].tag).toBe('span[data-type="math-expression"]');
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
});
