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

describe('InlineMath JSON roundtrip', () => {
  it('preserves latex and naturalLanguage attrs through getJSON/setContent cycle', () => {
    const editor = createEditor();

    // Insert an inlineMath node with attrs
    editor.commands.insertContent({
      type: 'paragraph',
      content: [
        { type: 'text', text: 'Hello ' },
        {
          type: 'inlineMath',
          attrs: { latex: 'x^2 + 1', naturalLanguage: 'x squared plus one' },
        },
        { type: 'text', text: ' world' },
      ],
    });

    // Get JSON (this is what gets saved to DB)
    const json = editor.getJSON();
    console.log('Saved JSON:', JSON.stringify(json, null, 2));

    // Verify JSON contains the attrs
    const paragraph = json.content?.[0];
    const mathNode = paragraph?.content?.find(
      (n: { type: string }) => n.type === 'inlineMath',
    );
    expect(mathNode).toBeDefined();
    expect(mathNode?.attrs?.latex).toBe('x^2 + 1');
    expect(mathNode?.attrs?.naturalLanguage).toBe('x squared plus one');

    // Create a NEW editor with the saved JSON (simulates page reload)
    const editor2 = createEditor(json);
    const json2 = editor2.getJSON();

    // Verify the roundtrip preserved attrs
    const paragraph2 = json2.content?.[0];
    const mathNode2 = paragraph2?.content?.find(
      (n: { type: string }) => n.type === 'inlineMath',
    );
    expect(mathNode2).toBeDefined();
    expect(mathNode2?.attrs?.latex).toBe('x^2 + 1');
    expect(mathNode2?.attrs?.naturalLanguage).toBe('x squared plus one');

    // Also test setContent (simulates realtime sync)
    const editor3 = createEditor();
    editor3.commands.setContent(json);
    const json3 = editor3.getJSON();

    const paragraph3 = json3.content?.[0];
    const mathNode3 = paragraph3?.content?.find(
      (n: { type: string }) => n.type === 'inlineMath',
    );
    expect(mathNode3).toBeDefined();
    expect(mathNode3?.attrs?.latex).toBe('x^2 + 1');
    expect(mathNode3?.attrs?.naturalLanguage).toBe('x squared plus one');

    editor.destroy();
    editor2.destroy();
    editor3.destroy();
  });

  it('node attrs are accessible after loading from JSON content', () => {
    const content = {
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [
            {
              type: 'inlineMath',
              attrs: {
                latex: 'E = mc^2',
                naturalLanguage:
                  'energy equals mass times speed of light squared',
              },
            },
          ],
        },
      ],
    };

    const editor = createEditor(content);

    // Walk the document and find the inlineMath node
    let foundLatex = '';
    let foundNL = '';
    editor.state.doc.descendants((node) => {
      if (node.type.name === 'inlineMath') {
        foundLatex = node.attrs.latex;
        foundNL = node.attrs.naturalLanguage;
      }
    });

    expect(foundLatex).toBe('E = mc^2');
    expect(foundNL).toBe('energy equals mass times speed of light squared');

    editor.destroy();
  });
});
