import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Editor } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import UnderlineExt from '@tiptap/extension-underline';
import TextAlign from '@tiptap/extension-text-align';
import TaskList from '@tiptap/extension-task-list';
import TaskItem from '@tiptap/extension-task-item';
import LinkExt from '@tiptap/extension-link';
import { Indent } from '@/lib/editor/indent-extension';
import { EditorToolbar } from './editor-toolbar';
import { TooltipProvider } from '@/components/ui/tooltip';

function createTestEditor(content = '<p>Hello world</p>') {
  return new Editor({
    element: document.createElement('div'),
    extensions: [
      StarterKit.configure({ heading: { levels: [1, 2, 3] } }),
      UnderlineExt,
      TextAlign.configure({ types: ['heading', 'paragraph'] }),
      TaskList,
      TaskItem.configure({ nested: true }),
      LinkExt.configure({ openOnClick: false }),
      Indent,
    ],
    content,
  });
}

function renderToolbar(editor: Editor) {
  return render(
    <TooltipProvider>
      <EditorToolbar editor={editor} />
    </TooltipProvider>,
  );
}

describe('EditorToolbar', () => {
  let editor: Editor;

  beforeEach(() => {
    editor = createTestEditor();
  });

  afterEach(() => {
    editor.destroy();
  });

  describe('rendering', () => {
    it('renders all formatting buttons with aria-labels', () => {
      renderToolbar(editor);

      const expectedLabels = [
        'Undo',
        'Redo',
        'Bold',
        'Italic',
        'Underline',
        'Strikethrough',
        'Align left',
        'Align center',
        'Align right',
        'Bullet list',
        'Numbered list',
        'Task list',
        'Indent',
        'Outdent',
        'Link',
        'Code block',
        'Horizontal rule',
        'Blockquote',
      ];

      for (const label of expectedLabels) {
        expect(screen.getByRole('button', { name: label })).toBeInTheDocument();
      }
    });

    it('renders the heading dropdown with "Normal text" by default', () => {
      renderToolbar(editor);
      expect(screen.getByText('Normal text')).toBeInTheDocument();
    });

    it('renders vertical separators between button groups', () => {
      const { container } = renderToolbar(editor);
      const separators = container.querySelectorAll('[data-slot="separator"]');
      expect(separators.length).toBe(6);
    });
  });

  describe('inline formatting buttons', () => {
    it('toggles bold on click', async () => {
      const user = userEvent.setup();
      renderToolbar(editor);

      editor.commands.setContent('<p>Hello world</p>');
      editor.commands.selectAll();

      await user.click(screen.getByRole('button', { name: 'Bold' }));
      expect(editor.isActive('bold')).toBe(true);
    });

    it('toggles italic on click', async () => {
      const user = userEvent.setup();
      renderToolbar(editor);

      editor.commands.selectAll();
      await user.click(screen.getByRole('button', { name: 'Italic' }));
      expect(editor.isActive('italic')).toBe(true);
    });

    it('toggles underline on click', async () => {
      const user = userEvent.setup();
      renderToolbar(editor);

      editor.commands.selectAll();
      await user.click(screen.getByRole('button', { name: 'Underline' }));
      expect(editor.isActive('underline')).toBe(true);
    });

    it('toggles strikethrough on click', async () => {
      const user = userEvent.setup();
      renderToolbar(editor);

      editor.commands.selectAll();
      await user.click(screen.getByRole('button', { name: 'Strikethrough' }));
      expect(editor.isActive('strike')).toBe(true);
    });
  });

  describe('block formatting buttons', () => {
    it('toggles bullet list on click', async () => {
      const user = userEvent.setup();
      renderToolbar(editor);

      editor.commands.focus();
      await user.click(screen.getByRole('button', { name: 'Bullet list' }));
      expect(editor.isActive('bulletList')).toBe(true);
    });

    it('toggles numbered list on click', async () => {
      const user = userEvent.setup();
      renderToolbar(editor);

      editor.commands.focus();
      await user.click(screen.getByRole('button', { name: 'Numbered list' }));
      expect(editor.isActive('orderedList')).toBe(true);
    });

    it('toggles task list on click', async () => {
      const user = userEvent.setup();
      renderToolbar(editor);

      editor.commands.focus();
      await user.click(screen.getByRole('button', { name: 'Task list' }));
      expect(editor.isActive('taskList')).toBe(true);
    });

    it('toggles blockquote on click', async () => {
      const user = userEvent.setup();
      renderToolbar(editor);

      editor.commands.focus();
      await user.click(screen.getByRole('button', { name: 'Blockquote' }));
      expect(editor.isActive('blockquote')).toBe(true);
    });

    it('toggles code block on click', async () => {
      const user = userEvent.setup();
      renderToolbar(editor);

      editor.commands.focus();
      await user.click(screen.getByRole('button', { name: 'Code block' }));
      expect(editor.isActive('codeBlock')).toBe(true);
    });

    it('inserts horizontal rule on click', async () => {
      const user = userEvent.setup();
      renderToolbar(editor);

      editor.commands.focus();
      await user.click(screen.getByRole('button', { name: 'Horizontal rule' }));

      const json = editor.getJSON();
      const hasHr = json.content?.some(
        (node) => node.type === 'horizontalRule',
      );
      expect(hasHr).toBe(true);
    });
  });

  describe('text alignment buttons', () => {
    it('sets text alignment to center on click', async () => {
      const user = userEvent.setup();
      renderToolbar(editor);

      editor.commands.focus();
      await user.click(screen.getByRole('button', { name: 'Align center' }));
      expect(editor.isActive({ textAlign: 'center' })).toBe(true);
    });

    it('sets text alignment to right on click', async () => {
      const user = userEvent.setup();
      renderToolbar(editor);

      editor.commands.focus();
      await user.click(screen.getByRole('button', { name: 'Align right' }));
      expect(editor.isActive({ textAlign: 'right' })).toBe(true);
    });

    it('sets text alignment to left on click', async () => {
      const user = userEvent.setup();
      renderToolbar(editor);

      editor.commands.focus();
      await user.click(screen.getByRole('button', { name: 'Align left' }));
      expect(editor.isActive({ textAlign: 'left' })).toBe(true);
    });
  });

  describe('history buttons', () => {
    it('disables undo when there is no history', () => {
      renderToolbar(editor);
      expect(screen.getByRole('button', { name: 'Undo' })).toBeDisabled();
    });

    it('disables redo when there is no redo history', () => {
      renderToolbar(editor);
      expect(screen.getByRole('button', { name: 'Redo' })).toBeDisabled();
    });
  });

  describe('link button', () => {
    it('prompts for URL when clicked', async () => {
      const user = userEvent.setup();
      const promptSpy = vi.spyOn(window, 'prompt').mockReturnValue(null);
      renderToolbar(editor);

      editor.commands.selectAll();
      await user.click(screen.getByRole('button', { name: 'Link' }));

      expect(promptSpy).toHaveBeenCalledWith('URL', undefined);
      promptSpy.mockRestore();
    });

    it('sets link when URL is provided', async () => {
      const user = userEvent.setup();
      const promptSpy = vi
        .spyOn(window, 'prompt')
        .mockReturnValue('https://example.com');
      renderToolbar(editor);

      editor.commands.selectAll();
      await user.click(screen.getByRole('button', { name: 'Link' }));

      expect(editor.isActive('link')).toBe(true);
      promptSpy.mockRestore();
    });
  });
});
