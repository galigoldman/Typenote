import { describe, it, expect } from 'vitest';
import { Editor } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import { InlineMath } from './inline-math';

/**
 * Diagnostic test: traces exactly what happens when updateAttributes
 * is called on an inlineMath node and whether getJSON() captures the attrs.
 */
describe('InlineMath updateAttributes → getJSON diagnostic', () => {
  it('should include attrs in getJSON after updateAttributes via command', () => {
    const editor = new Editor({
      extensions: [StarterKit, InlineMath],
      content: { type: 'doc', content: [{ type: 'paragraph' }] },
    });

    // Step 1: Insert a math node
    editor.commands.insertMath();
    const json1 = editor.getJSON();
    console.log('After insertMath:', JSON.stringify(json1));

    // Verify the node exists with empty attrs
    const mathNode1 = json1.content?.[0]?.content?.[0];
    expect(mathNode1?.type).toBe('inlineMath');
    console.log('Math node attrs after insert:', JSON.stringify(mathNode1?.attrs));

    // Step 2: Find the math node position and update its attrs directly via transaction
    let mathPos = -1;
    editor.state.doc.descendants((node, pos) => {
      if (node.type.name === 'inlineMath' && mathPos === -1) {
        mathPos = pos;
      }
    });
    console.log('Math node position:', mathPos);
    expect(mathPos).toBeGreaterThanOrEqual(0);

    // Step 3: Update attrs via setNodeMarkup (what updateAttributes does internally)
    const tr = editor.state.tr.setNodeMarkup(mathPos, undefined, {
      latex: '\\frac{1}{2} \\times 5',
      naturalLanguage: 'one half times five',
    });
    editor.view.dispatch(tr);

    const json2 = editor.getJSON();
    console.log('After setNodeMarkup:', JSON.stringify(json2));

    const mathNode2 = json2.content?.[0]?.content?.[0];
    console.log('Math node attrs after update:', JSON.stringify(mathNode2?.attrs));

    // THIS IS THE KEY ASSERTION: are attrs present in getJSON?
    expect(mathNode2?.attrs?.latex).toBe('\\frac{1}{2} \\times 5');
    expect(mathNode2?.attrs?.naturalLanguage).toBe('one half times five');

    editor.destroy();
  });

  it('should fire onUpdate when updateAttributes is called', () => {
    let updateCount = 0;
    let lastJson: unknown = null;

    const editor = new Editor({
      extensions: [StarterKit, InlineMath],
      content: { type: 'doc', content: [{ type: 'paragraph' }] },
      onUpdate: ({ editor: e }) => {
        updateCount++;
        lastJson = e.getJSON();
        console.log(`onUpdate #${updateCount}:`, JSON.stringify(lastJson));
      },
    });

    // Insert math node
    editor.commands.insertMath();
    const insertUpdateCount = updateCount;
    console.log('Updates after insertMath:', insertUpdateCount);

    // Update attrs
    let mathPos = -1;
    editor.state.doc.descendants((node, pos) => {
      if (node.type.name === 'inlineMath' && mathPos === -1) {
        mathPos = pos;
      }
    });

    const tr = editor.state.tr.setNodeMarkup(mathPos, undefined, {
      latex: '\\frac{1}{2} \\times 5',
      naturalLanguage: 'test',
    });
    editor.view.dispatch(tr);

    console.log('Updates after setNodeMarkup:', updateCount);
    console.log('Last JSON from onUpdate:', JSON.stringify(lastJson));

    // Did onUpdate fire for the attribute change?
    expect(updateCount).toBeGreaterThan(insertUpdateCount);

    // Does the JSON from onUpdate include the attrs?
    const json = lastJson as { content: Array<{ content: Array<{ attrs?: Record<string, string> }> }> };
    expect(json.content[0].content[0].attrs?.latex).toBe('\\frac{1}{2} \\times 5');

    editor.destroy();
  });

  it('insertContent with attrs should include them in getJSON', () => {
    const editor = new Editor({
      extensions: [StarterKit, InlineMath],
      content: { type: 'doc', content: [{ type: 'paragraph' }] },
    });

    // Insert a math node WITH attrs using insertContent
    editor.commands.insertContent({
      type: 'inlineMath',
      attrs: { latex: '\\frac{1}{2} \\times 5', naturalLanguage: 'test' },
    });

    const json = editor.getJSON();
    console.log('After insertContent with attrs:', JSON.stringify(json));

    const mathNode = json.content?.[0]?.content?.[0];
    console.log('Attrs:', JSON.stringify(mathNode?.attrs));

    expect(mathNode?.type).toBe('inlineMath');
    expect(mathNode?.attrs?.latex).toBe('\\frac{1}{2} \\times 5');
    expect(mathNode?.attrs?.naturalLanguage).toBe('test');

    editor.destroy();
  });

  it('delete then insertContent should preserve attrs in getJSON', () => {
    const editor = new Editor({
      extensions: [StarterKit, InlineMath],
      content: {
        type: 'doc',
        content: [{
          type: 'paragraph',
          content: [{ type: 'inlineMath', attrs: { latex: '', naturalLanguage: '' } }],
        }],
      },
    });

    // Find and delete the empty math node
    let mathPos = -1;
    editor.state.doc.descendants((node, pos) => {
      if (node.type.name === 'inlineMath' && mathPos === -1) mathPos = pos;
    });
    editor.commands.deleteRange({ from: mathPos, to: mathPos + 1 });

    console.log('After delete:', JSON.stringify(editor.getJSON()));

    // Now insert a new one with attrs
    editor.commands.insertContent({
      type: 'inlineMath',
      attrs: { latex: '\\frac{1}{2} \\times 5', naturalLanguage: 'test' },
    });

    const json = editor.getJSON();
    console.log('After delete+insert:', JSON.stringify(json));

    const mathNode = json.content?.[0]?.content?.[0];
    expect(mathNode?.attrs?.latex).toBe('\\frac{1}{2} \\times 5');

    editor.destroy();
  });

  it('replaceWith in single transaction should preserve attrs and fire onUpdate once', () => {
    let updateCount = 0;
    let lastJson: unknown = null;

    const editor = new Editor({
      extensions: [StarterKit, InlineMath],
      content: {
        type: 'doc',
        content: [{
          type: 'paragraph',
          content: [{ type: 'inlineMath', attrs: { latex: '', naturalLanguage: '' } }],
        }],
      },
      onUpdate: ({ editor: e }) => {
        updateCount++;
        lastJson = e.getJSON();
      },
    });

    // Reset counter after initialization
    updateCount = 0;
    lastJson = null;

    // Find the empty math node
    let mathPos = -1;
    editor.state.doc.descendants((node, pos) => {
      if (node.type.name === 'inlineMath' && mathPos === -1) mathPos = pos;
    });
    expect(mathPos).toBeGreaterThanOrEqual(0);

    // Replace using single transaction (same approach as replaceWithMath)
    const { tr } = editor.state;
    const nodeSize = editor.state.doc.nodeAt(mathPos)?.nodeSize ?? 1;
    tr.replaceWith(
      mathPos,
      mathPos + nodeSize,
      editor.state.schema.nodes.inlineMath.create({
        latex: '\\frac{1}{2} \\times 5',
        naturalLanguage: 'one half times five',
      }),
    );
    editor.view.dispatch(tr);

    // Should fire exactly 1 onUpdate
    expect(updateCount).toBe(1);

    // The JSON from onUpdate should have attrs
    const json = lastJson as { content: Array<{ content: Array<{ attrs?: Record<string, string> }> }> };
    expect(json.content[0].content[0].attrs?.latex).toBe('\\frac{1}{2} \\times 5');
    expect(json.content[0].content[0].attrs?.naturalLanguage).toBe('one half times five');

    // getJSON directly should also have attrs
    const directJson = editor.getJSON();
    const mathNode = directJson.content?.[0]?.content?.[0];
    expect(mathNode?.attrs?.latex).toBe('\\frac{1}{2} \\times 5');

    editor.destroy();
  });

  it('getJSON should include non-default attrs', () => {
    // Start with a document that already has a math node with attrs
    const editor = new Editor({
      extensions: [StarterKit, InlineMath],
      content: {
        type: 'doc',
        content: [
          {
            type: 'paragraph',
            content: [
              {
                type: 'inlineMath',
                attrs: {
                  latex: '\\frac{1}{2} \\times 5',
                  naturalLanguage: 'one half times five',
                },
              },
            ],
          },
        ],
      },
    });

    const json = editor.getJSON();
    console.log('getJSON with pre-set attrs:', JSON.stringify(json));

    const mathNode = json.content?.[0]?.content?.[0];
    console.log('Attrs:', JSON.stringify(mathNode?.attrs));

    // If this fails, TipTap strips attrs during serialization
    expect(mathNode?.attrs?.latex).toBe('\\frac{1}{2} \\times 5');
    expect(mathNode?.attrs?.naturalLanguage).toBe('one half times five');

    editor.destroy();
  });
});
