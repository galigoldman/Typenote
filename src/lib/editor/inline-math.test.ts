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

describe('InlineMath node extension', () => {
  it('registers the inlineMath node type as inline and atom', () => {
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

    // Create a node with no explicit attrs to verify defaults
    const node = nodeType.create();
    expect(node.attrs.latex).toBe('');
    expect(node.attrs.naturalLanguage).toBe('');

    editor.destroy();
  });

  it('can insert an inlineMath node via insertContent and verify attrs in getJSON', () => {
    const editor = createEditor();

    editor.commands.insertContent({
      type: 'paragraph',
      content: [
        { type: 'text', text: 'Before ' },
        {
          type: 'inlineMath',
          attrs: {
            latex: 'a^2 + b^2 = c^2',
            naturalLanguage: 'Pythagorean theorem',
          },
        },
        { type: 'text', text: ' after' },
      ],
    });

    const json = editor.getJSON();
    const paragraph = json.content?.[0];
    const mathNode = paragraph?.content?.find(
      (n: { type: string }) => n.type === 'inlineMath',
    );

    expect(mathNode).toBeDefined();
    expect(mathNode?.attrs?.latex).toBe('a^2 + b^2 = c^2');
    expect(mathNode?.attrs?.naturalLanguage).toBe('Pythagorean theorem');

    editor.destroy();
  });
});
