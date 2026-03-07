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

    const savedContent = editor.getJSON();
    const fromDb = JSON.parse(JSON.stringify(savedContent));
    const reloadedEditor = createEditor(fromDb);
    const reloadedJson = reloadedEditor.getJSON();

    const paragraph = reloadedJson.content?.[0];
    const mathNode = paragraph?.content?.find(
      (n: { type: string }) => n.type === 'inlineMath',
    );

    expect(mathNode).toBeDefined();
    expect(mathNode?.attrs?.latex).toBe('E = mc^2');
    expect(mathNode?.attrs?.naturalLanguage).toBe(
      'energy equals mass times speed of light squared',
    );

    const textNodes = paragraph?.content?.filter(
      (n: { type: string }) => n.type === 'text',
    );
    expect(textNodes?.[0]?.text).toBe('Energy formula: ');
    expect(textNodes?.[1]?.text).toBe(' is famous.');

    editor.destroy();
    reloadedEditor.destroy();
  });

  it('math node survives realtime sync (setContent)', () => {
    const editor = createEditor();
    editor.commands.insertContent({
      type: 'inlineMath',
      attrs: { latex: '\\pi r^2', naturalLanguage: 'pi r squared' },
    });

    const savedContent = editor.getJSON();

    const remoteEditor = createEditor();
    remoteEditor.commands.setContent(savedContent as Record<string, unknown>);

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
