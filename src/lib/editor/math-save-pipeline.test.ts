import { describe, it, expect, vi } from 'vitest';
import { Editor } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import { InlineMath } from './inline-math';

/**
 * These tests simulate the EXACT browser save pipeline step by step
 * to find where math node attrs get lost.
 */
describe('Math save pipeline — step by step', () => {
  // STEP 1: Does getJSON() include attrs when content was loaded WITHOUT explicit attrs?
  // (This is what happens when DB has {"type": "inlineMath"} with no attrs key)
  it('Step 1: getJSON includes attrs for node loaded without explicit attrs key', () => {
    const editor = new Editor({
      extensions: [StarterKit, InlineMath],
      content: {
        type: 'doc',
        content: [
          {
            type: 'paragraph',
            content: [{ type: 'inlineMath' }], // NO attrs key — exactly like DB
          },
        ],
      },
    });

    const json = editor.getJSON();
    const mathNode = json.content?.[0]?.content?.[0];
    console.log('Step 1 — loaded without attrs, getJSON:', JSON.stringify(mathNode));

    expect(mathNode?.type).toBe('inlineMath');
    // KEY QUESTION: are attrs present?
    expect(mathNode?.attrs).toBeDefined();
    expect(mathNode?.attrs?.latex).toBe('');
    expect(mathNode?.attrs?.naturalLanguage).toBe('');

    editor.destroy();
  });

  // STEP 2: Does commands.command() with tr.replaceWith() fire onUpdate?
  it('Step 2: commands.command with tr.replaceWith fires onUpdate with correct attrs', () => {
    let updateCount = 0;
    let lastJson: unknown = null;

    const editor = new Editor({
      extensions: [StarterKit, InlineMath],
      content: {
        type: 'doc',
        content: [
          {
            type: 'paragraph',
            content: [{ type: 'inlineMath' }],
          },
        ],
      },
      onUpdate: ({ editor: e }) => {
        updateCount++;
        lastJson = e.getJSON();
      },
    });

    updateCount = 0;
    lastJson = null;

    editor.commands.command(({ tr, state }) => {
      let mathPos = -1;
      state.doc.descendants((n, pos) => {
        if (n.type.name === 'inlineMath' && mathPos === -1) mathPos = pos;
      });
      if (mathPos === -1) return false;

      const nodeSize = state.doc.nodeAt(mathPos)?.nodeSize ?? 1;
      tr.replaceWith(
        mathPos,
        mathPos + nodeSize,
        state.schema.nodes.inlineMath.create({
          latex: '\\frac{1}{2} \\times 5',
          naturalLanguage: 'one half times five',
        }),
      );
      return true;
    });

    console.log('Step 2 — updateCount:', updateCount);
    console.log('Step 2 — lastJson:', JSON.stringify(lastJson));

    expect(updateCount).toBe(1);
    const json = lastJson as {
      content: Array<{ content: Array<{ attrs?: Record<string, string> }> }>;
    };
    expect(json.content[0].content[0].attrs?.latex).toBe(
      '\\frac{1}{2} \\times 5',
    );

    editor.destroy();
  });

  // STEP 3: Does the hasEmptyMath guard work correctly?
  it('Step 3: hasEmptyMath guard blocks empty math, allows after replace', () => {
    let triggerSaveCount = 0;

    const editor = new Editor({
      extensions: [StarterKit, InlineMath],
      content: {
        type: 'doc',
        content: [
          {
            type: 'paragraph',
            content: [{ type: 'inlineMath' }],
          },
        ],
      },
      onUpdate: ({ editor: e }) => {
        let hasEmptyMath = false;
        e.state.doc.descendants((node) => {
          if (node.type.name === 'inlineMath' && node.attrs.latex === '') {
            hasEmptyMath = true;
          }
        });
        if (hasEmptyMath) return;
        triggerSaveCount++;
      },
    });

    triggerSaveCount = 0;

    // Replace empty math with full attrs
    editor.commands.command(({ tr, state }) => {
      let mathPos = -1;
      state.doc.descendants((n, pos) => {
        if (n.type.name === 'inlineMath' && mathPos === -1) mathPos = pos;
      });
      if (mathPos === -1) return false;
      const nodeSize = state.doc.nodeAt(mathPos)?.nodeSize ?? 1;
      tr.replaceWith(
        mathPos,
        mathPos + nodeSize,
        state.schema.nodes.inlineMath.create({
          latex: '\\frac{1}{2}',
          naturalLanguage: 'one half',
        }),
      );
      return true;
    });

    console.log('Step 3 — triggerSaveCount:', triggerSaveCount);
    expect(triggerSaveCount).toBe(1);

    editor.destroy();
  });

  // STEP 4: Full pipeline — getJSON after replace, then JSON.stringify/parse roundtrip
  // This catches any serialization issues
  it('Step 4: getJSON → stringify → parse preserves attrs (serialization roundtrip)', () => {
    const editor = new Editor({
      extensions: [StarterKit, InlineMath],
      content: {
        type: 'doc',
        content: [
          {
            type: 'paragraph',
            content: [{ type: 'inlineMath' }],
          },
        ],
      },
    });

    // Replace
    editor.commands.command(({ tr, state }) => {
      let mathPos = -1;
      state.doc.descendants((n, pos) => {
        if (n.type.name === 'inlineMath' && mathPos === -1) mathPos = pos;
      });
      if (mathPos === -1) return false;
      const nodeSize = state.doc.nodeAt(mathPos)?.nodeSize ?? 1;
      tr.replaceWith(
        mathPos,
        mathPos + nodeSize,
        state.schema.nodes.inlineMath.create({
          latex: '\\frac{1}{2} \\times 5',
          naturalLanguage: 'one half times five',
        }),
      );
      return true;
    });

    // Simulate what the save pipeline does
    const content = editor.getJSON() as Record<string, unknown>;
    const serialized = JSON.stringify(content);
    const deserialized = JSON.parse(serialized);

    console.log('Step 4 — serialized:', serialized);
    console.log('Step 4 — deserialized math node:', JSON.stringify(deserialized.content[0].content[0]));

    const mathNode = deserialized.content[0].content[0];
    expect(mathNode.attrs.latex).toBe('\\frac{1}{2} \\times 5');
    expect(mathNode.attrs.naturalLanguage).toBe('one half times five');

    editor.destroy();
  });

  // STEP 5: Simulate the EXACT handleSubmit flow with async gap
  it('Step 5: async gap (like API call) does not break replace + save', async () => {
    let savedContent: unknown = null;

    const editor = new Editor({
      extensions: [StarterKit, InlineMath],
      content: {
        type: 'doc',
        content: [
          {
            type: 'paragraph',
            content: [{ type: 'inlineMath' }],
          },
        ],
      },
      onUpdate: ({ editor: e }) => {
        let hasEmptyMath = false;
        e.state.doc.descendants((node) => {
          if (node.type.name === 'inlineMath' && node.attrs.latex === '') {
            hasEmptyMath = true;
          }
        });
        if (hasEmptyMath) return;
        // Simulate what saveFn does — capture getJSON at this moment
        savedContent = e.getJSON();
      },
    });

    // Simulate async API call
    const apiResult = await new Promise<string>((resolve) =>
      setTimeout(() => resolve('\\frac{1}{2} \\times 5'), 10),
    );

    // After API returns, replace the math node (like replaceWithMath does)
    editor.commands.command(({ tr, state }) => {
      let mathPos = -1;
      state.doc.descendants((n, pos) => {
        if (n.type.name === 'inlineMath' && mathPos === -1) mathPos = pos;
      });
      if (mathPos === -1) return false;
      const nodeSize = state.doc.nodeAt(mathPos)?.nodeSize ?? 1;
      tr.replaceWith(
        mathPos,
        mathPos + nodeSize,
        state.schema.nodes.inlineMath.create({
          latex: apiResult,
          naturalLanguage: 'one half times five',
        }),
      );
      return true;
    });

    console.log('Step 5 — savedContent:', JSON.stringify(savedContent));

    expect(savedContent).not.toBeNull();
    const json = savedContent as {
      content: Array<{ content: Array<{ type: string; attrs?: Record<string, string> }> }>;
    };
    expect(json.content[0].content[0].type).toBe('inlineMath');
    expect(json.content[0].content[0].attrs?.latex).toBe(
      '\\frac{1}{2} \\times 5',
    );

    editor.destroy();
  });

  // STEP 6: setMathResult replaces node; getJSON after command has correct attrs
  // (save is handled by handleSubmit, not by setMathResult itself)
  it('Step 6: getJSON after setMathResult has correct attrs', () => {
    const editor = new Editor({
      extensions: [StarterKit, InlineMath],
      content: {
        type: 'doc',
        content: [
          {
            type: 'paragraph',
            content: [{ type: 'inlineMath' }],
          },
        ],
      },
    });

    editor.commands.setMathResult('\\frac{1}{2} \\times 5', 'one half times five');

    const json = editor.getJSON();
    const mathNode = json.content?.[0]?.content?.[0];
    console.log('Step 6 — getJSON after setMathResult:', JSON.stringify(mathNode));

    expect(mathNode?.type).toBe('inlineMath');
    expect(mathNode?.attrs?.latex).toBe('\\frac{1}{2} \\times 5');
    expect(mathNode?.attrs?.naturalLanguage).toBe('one half times five');

    editor.destroy();
  });

  // STEP 7: Simulate debounced save — onUpdate sets timer, timer fires later and reads getJSON
  it('Step 7: debounced save reads correct getJSON 800ms after replace', async () => {
    let savedContent: unknown = null;
    const saveFn = vi.fn();

    const editor = new Editor({
      extensions: [StarterKit, InlineMath],
      content: {
        type: 'doc',
        content: [
          {
            type: 'paragraph',
            content: [{ type: 'inlineMath' }],
          },
        ],
      },
      onUpdate: () => {
        // Simulate debounced save: capture content after 100ms delay
        setTimeout(() => {
          const content = editor.getJSON();
          savedContent = content;
          saveFn(content);
        }, 100);
      },
    });

    // Replace the math node
    editor.commands.command(({ tr, state }) => {
      let mathPos = -1;
      state.doc.descendants((n, pos) => {
        if (n.type.name === 'inlineMath' && mathPos === -1) mathPos = pos;
      });
      if (mathPos === -1) return false;
      const nodeSize = state.doc.nodeAt(mathPos)?.nodeSize ?? 1;
      tr.replaceWith(
        mathPos,
        mathPos + nodeSize,
        state.schema.nodes.inlineMath.create({
          latex: '\\frac{1}{2} \\times 5',
          naturalLanguage: 'one half times five',
        }),
      );
      return true;
    });

    // Wait for the debounced save
    await new Promise((resolve) => setTimeout(resolve, 200));

    console.log('Step 6 — savedContent:', JSON.stringify(savedContent));

    expect(saveFn).toHaveBeenCalled();
    const json = savedContent as {
      content: Array<{ content: Array<{ type: string; attrs?: Record<string, string> }> }>;
    };
    expect(json.content[0].content[0].attrs?.latex).toBe(
      '\\frac{1}{2} \\times 5',
    );

    editor.destroy();
  });

  // STEP 8: Does getJSON() preserve non-default attrs when loaded via content option?
  it('Step 8: getJSON preserves non-default attrs loaded via content option', () => {
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
    const mathNode = json.content?.[0]?.content?.[0];
    console.log('Step 8 — loaded with attrs, getJSON:', JSON.stringify(mathNode));

    expect(mathNode?.type).toBe('inlineMath');
    expect(mathNode?.attrs?.latex).toBe('\\frac{1}{2} \\times 5');
    expect(mathNode?.attrs?.naturalLanguage).toBe('one half times five');

    editor.destroy();
  });

  // STEP 9: Does setContent() preserve attrs and getJSON() reflect them?
  it('Step 9: setContent with attrs → getJSON preserves them', () => {
    const editor = new Editor({
      extensions: [StarterKit, InlineMath],
      content: { type: 'doc', content: [{ type: 'paragraph' }] },
    });

    editor.commands.setContent({
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
    });

    const json = editor.getJSON();
    const mathNode = json.content?.[0]?.content?.[0];
    console.log('Step 9 — after setContent, getJSON:', JSON.stringify(mathNode));

    expect(mathNode?.type).toBe('inlineMath');
    expect(mathNode?.attrs?.latex).toBe('\\frac{1}{2} \\times 5');
    expect(mathNode?.attrs?.naturalLanguage).toBe('one half times five');

    editor.destroy();
  });

  // STEP 10: Does onUpdate fire during initial content load?
  it('Step 10: onUpdate does NOT fire on initial content load', () => {
    let updateCount = 0;

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
      onUpdate: () => {
        updateCount++;
      },
    });

    console.log('Step 10 — updateCount after init:', updateCount);
    expect(updateCount).toBe(0);

    editor.destroy();
  });

  // STEP 11: Does setContent with emitUpdate:false trigger onUpdate?
  it('Step 11: setContent with emitUpdate:false does NOT fire onUpdate', () => {
    let updateCount = 0;

    const editor = new Editor({
      extensions: [StarterKit, InlineMath],
      content: { type: 'doc', content: [{ type: 'paragraph' }] },
      onUpdate: () => {
        updateCount++;
      },
    });

    updateCount = 0;
    editor.commands.setContent(
      {
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
      { emitUpdate: false },
    );

    console.log('Step 11 — updateCount after setContent(emitUpdate:false):', updateCount);
    expect(updateCount).toBe(0);

    // But getJSON should have the attrs
    const json = editor.getJSON();
    const mathNode = json.content?.[0]?.content?.[0];
    expect(mathNode?.attrs?.latex).toBe('\\frac{1}{2} \\times 5');

    editor.destroy();
  });
});
