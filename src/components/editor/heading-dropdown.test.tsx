import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { Editor } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import { HeadingDropdown } from './heading-dropdown';

function createTestEditor(content = '<p>Hello world</p>') {
  return new Editor({
    element: document.createElement('div'),
    extensions: [StarterKit.configure({ heading: { levels: [1, 2, 3] } })],
    content,
  });
}

describe('HeadingDropdown', () => {
  let editor: Editor;

  beforeEach(() => {
    editor = createTestEditor();
  });

  afterEach(() => {
    editor.destroy();
  });

  it('shows "Normal text" when cursor is in a paragraph', () => {
    render(<HeadingDropdown editor={editor} />);
    expect(screen.getByText('Normal text')).toBeInTheDocument();
  });

  it('shows "Heading 1" when cursor is in a heading 1', () => {
    editor.commands.setContent('<h1>Title</h1>');
    editor.commands.focus();
    render(<HeadingDropdown editor={editor} />);
    expect(screen.getByText('Heading 1')).toBeInTheDocument();
  });

  it('shows "Heading 2" when cursor is in a heading 2', () => {
    editor.commands.setContent('<h2>Subtitle</h2>');
    editor.commands.focus();
    render(<HeadingDropdown editor={editor} />);
    expect(screen.getByText('Heading 2')).toBeInTheDocument();
  });

  it('shows all heading options in the dropdown', async () => {
    const user = userEvent.setup();
    render(<HeadingDropdown editor={editor} />);

    await user.click(screen.getByRole('button'));

    // "Normal text" appears twice: in the trigger and in the dropdown menu
    expect(screen.getAllByText('Normal text')).toHaveLength(2);
    expect(screen.getByText('Heading 1')).toBeInTheDocument();
    expect(screen.getByText('Heading 2')).toBeInTheDocument();
    expect(screen.getByText('Heading 3')).toBeInTheDocument();
  });

  it('sets heading 1 when selected from dropdown', async () => {
    const user = userEvent.setup();
    render(<HeadingDropdown editor={editor} />);

    editor.commands.focus();
    await user.click(screen.getByRole('button'));
    await user.click(screen.getByText('Heading 1'));

    expect(editor.isActive('heading', { level: 1 })).toBe(true);
  });

  it('sets heading 2 when selected from dropdown', async () => {
    const user = userEvent.setup();
    render(<HeadingDropdown editor={editor} />);

    editor.commands.focus();
    await user.click(screen.getByRole('button'));
    await user.click(screen.getByText('Heading 2'));

    expect(editor.isActive('heading', { level: 2 })).toBe(true);
  });

  it('resets to paragraph when "Normal text" is selected', async () => {
    const user = userEvent.setup();
    editor.commands.setContent('<h1>Title</h1>');
    editor.commands.focus();
    render(<HeadingDropdown editor={editor} />);

    await user.click(screen.getByRole('button'));

    // There are two "Normal text" - one in trigger, one in dropdown menu
    const options = screen.getAllByText('Normal text');
    await user.click(options[options.length - 1]);

    expect(editor.isActive('heading')).toBe(false);
  });
});
