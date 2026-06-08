'use client';

import { useRef, useEffect } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import UnderlineExt from '@tiptap/extension-underline';
import TextAlign from '@tiptap/extension-text-align';
import TaskList from '@tiptap/extension-task-list';
import TaskItem from '@tiptap/extension-task-item';
import LinkExt from '@tiptap/extension-link';
import HighlightExt from '@tiptap/extension-highlight';
import { TextStyle } from '@tiptap/extension-text-style';
import { AutoDirection } from '@/lib/editor/rtl-extension';
import { Indent } from '@/lib/editor/indent-extension';
import { FontSize } from '@/lib/editor/font-size-extension';
import { MathExpression } from '@/lib/editor/math-extension';
import { shouldInterceptBackspaceAtStart } from '@/lib/canvas/cross-page-backspace';
import type { TextBox as TextBoxData } from '@/types/canvas';
import type { Editor } from '@tiptap/core';

interface TextBoxProps {
  textBox: TextBoxData;
  isSelected: boolean;
  readOnly?: boolean;
  /** Max height the text box can visually grow to (clips overflow).
   *  For -ftb flow text boxes this is PAGE_HEIGHT - y - margin so
   *  content that overflows the page boundary is never visible. */
  maxHeight?: number;
  onContentUpdate: (id: string, content: Record<string, unknown>) => void;
  onEditorReady?: (editor: Editor) => void;
  onHeightMeasured?: (id: string, height: number) => void;
  onContentBoundsMeasured?: (
    id: string,
    bounds: { offsetX: number; width: number } | undefined,
  ) => void;
  /** Called when Backspace is pressed at the very start of the first
   *  block. The parent (canvas-editor) handles the cross-page merge. */
  onBackspaceAtStart?: () => void;
}

export function TextBox({
  textBox,
  isSelected,
  readOnly = false,
  maxHeight,
  onContentUpdate,
  onEditorReady,
  onHeightMeasured,
  onContentBoundsMeasured,
  onBackspaceAtStart,
}: TextBoxProps) {
  // Store callbacks in refs so the TipTap editor instance (created once)
  // always calls the latest version without needing to be re-created.
  const onContentUpdateRef = useRef(onContentUpdate);
  const onEditorReadyRef = useRef(onEditorReady);
  const onHeightMeasuredRef = useRef(onHeightMeasured);
  const onContentBoundsMeasuredRef = useRef(onContentBoundsMeasured);
  const textBoxIdRef = useRef(textBox.id);
  const containerRef = useRef<HTMLDivElement>(null);
  const lastBoundsRef = useRef<{ offsetX: number; width: number } | undefined>(
    undefined,
  );
  const onBackspaceAtStartRef = useRef(onBackspaceAtStart);
  useEffect(() => {
    onContentUpdateRef.current = onContentUpdate;
    onEditorReadyRef.current = onEditorReady;
    onHeightMeasuredRef.current = onHeightMeasured;
    onContentBoundsMeasuredRef.current = onContentBoundsMeasured;
    onBackspaceAtStartRef.current = onBackspaceAtStart;
    textBoxIdRef.current = textBox.id;
  });

  // Sanitize content: ProseMirror crashes on { type: 'doc', content: [] }
  const safeContent = (() => {
    const c = textBox.content as { type?: string; content?: unknown[] } | null;
    if (!c || !c.content || c.content.length === 0) return undefined;
    return c as Record<string, unknown>;
  })();

  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit.configure({ heading: { levels: [1, 2, 3] } }),
      UnderlineExt,
      TextAlign.configure({ types: ['heading', 'paragraph'] }),
      TaskList,
      TaskItem.configure({ nested: true }),
      LinkExt.configure({
        openOnClick: false,
        HTMLAttributes: { class: 'text-primary underline cursor-pointer' },
      }),
      HighlightExt.configure({ multicolor: true }),
      TextStyle,
      FontSize,
      AutoDirection,
      Indent,
      MathExpression,
    ],
    content: safeContent,
    editorProps: {
      attributes: {
        class: 'prose prose-sm sm:prose-base max-w-none focus:outline-none p-2',
      },
      // Intercept Backspace at the very start of the text box (position
      // 1 = inside the first block, offset 0). ProseMirror's default
      // joinBackward can't merge across text boxes, so we hand off to
      // the parent (canvas-editor) for cross-page merge.
      handleKeyDown: (view, event) => {
        if (event.key === 'Backspace' && !event.shiftKey) {
          const { from, empty } = view.state.selection;
          // Only intercept a COLLAPSED cursor at the very start (position 1 =
          // offset 0 inside the first block; position 0 = before it). A
          // non-empty selection that merely starts here — e.g. Ctrl+A
          // select-all — must fall through to ProseMirror's native delete.
          if (shouldInterceptBackspaceAtStart({ from, empty })) {
            const cb = onBackspaceAtStartRef.current;
            if (cb) {
              event.preventDefault();
              cb();
              return true;
            }
          }
        }
        return false;
      },
    },
    onUpdate: ({ editor: ed }) => {
      onContentUpdateRef.current(
        textBoxIdRef.current,
        ed.getJSON() as Record<string, unknown>,
      );
      // When the container is already at maxHeight (full page), adding
      // content via Enter doesn't change the border box, so the
      // ResizeObserver won't fire. We must report the scrollHeight on
      // every content change so the overflow handler can detect and
      // cascade the overflowing blocks.
      requestAnimationFrame(() => {
        const el = containerRef.current;
        if (!el) return;
        const measured = el.scrollHeight;
        if (measured > 0) {
          onHeightMeasuredRef.current?.(textBoxIdRef.current, measured);
        }
      });
    },
    onFocus: ({ editor: ed }) => {
      onEditorReadyRef.current?.(ed);
    },
  });

  // Notify parent when editor is first created
  useEffect(() => {
    if (editor) {
      onEditorReadyRef.current?.(editor);
    }
  }, [editor]);

  // In Read mode, make the editor non-editable (text is selectable but not modifiable)
  useEffect(() => {
    if (!editor) return;
    const shouldBeEditable = !readOnly;
    if (editor.isEditable !== shouldBeEditable) {
      editor.setEditable(shouldBeEditable);
    }
  }, [readOnly, editor]);

  // Auto-measure content height and content bounds so the selection bbox stays tight.
  // Uses ResizeObserver to detect when content changes size.
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const measure = () => {
      // Height measurement (existing)
      const measured = el.scrollHeight;
      if (measured > 0) {
        onHeightMeasuredRef.current?.(textBoxIdRef.current, measured);
      }

      // Content bounds measurement: use Range API on ProseMirror block children
      // to find the actual rendered text width (not the container width).
      const proseMirror = el.querySelector('.ProseMirror');
      if (!proseMirror || proseMirror.children.length === 0) {
        // Empty text box — clear content bounds
        if (lastBoundsRef.current !== undefined) {
          lastBoundsRef.current = undefined;
          onContentBoundsMeasuredRef.current?.(textBoxIdRef.current, undefined);
        }
        return;
      }

      const containerRect = el.getBoundingClientRect();
      if (containerRect.width === 0) return;

      let contentMinX = Infinity;
      let contentMaxX = -Infinity;

      for (const child of proseMirror.children) {
        // Skip non-element nodes
        if (child.nodeType !== Node.ELEMENT_NODE) continue;
        // Create a range around the block's inline content
        const range = document.createRange();
        range.selectNodeContents(child);
        const rects = range.getClientRects();
        for (const rect of rects) {
          if (rect.width === 0) continue;
          contentMinX = Math.min(contentMinX, rect.left);
          contentMaxX = Math.max(contentMaxX, rect.right);
        }
      }

      if (contentMinX === Infinity) {
        // No measurable content
        if (lastBoundsRef.current !== undefined) {
          lastBoundsRef.current = undefined;
          onContentBoundsMeasuredRef.current?.(textBoxIdRef.current, undefined);
        }
        return;
      }

      // Convert viewport coords to container-relative coords
      const offsetX = contentMinX - containerRect.left;
      const width = contentMaxX - contentMinX;

      // Skip update if change < 2px (matching height threshold)
      const prev = lastBoundsRef.current;
      if (
        prev &&
        Math.abs(prev.offsetX - offsetX) < 2 &&
        Math.abs(prev.width - width) < 2
      ) {
        return;
      }

      const bounds = { offsetX, width };
      lastBoundsRef.current = bounds;
      onContentBoundsMeasuredRef.current?.(textBoxIdRef.current, bounds);
    };
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    // Initial measurement after mount
    measure();
    return () => observer.disconnect();
  }, [editor]);

  const fontScale = textBox.fontScale;

  return (
    <div
      ref={containerRef}
      data-textbox-id={textBox.id}
      className="absolute border border-transparent"
      style={{
        left: textBox.x,
        top: textBox.y,
        width: textBox.width,
        minHeight: textBox.height,
        // Clip content that grows past the page boundary so the
        // overflow handler can remove it without a visual flash.
        maxHeight: maxHeight,
        overflow: maxHeight ? 'hidden' : undefined,
      }}
    >
      {/* Wrapper that scales font. Uses a CSS variable + inline style on the
          ProseMirror element via the [style] selector to override rem-based
          prose classes. The wrapper sets font-size which child elements inherit. */}
      <div
        style={
          fontScale && fontScale !== 1
            ? { fontSize: `${fontScale}rem` }
            : undefined
        }
        className={
          fontScale && fontScale !== 1
            ? '[&_.ProseMirror]:!text-[length:inherit]'
            : undefined
        }
      >
        {editor && <EditorContent editor={editor} />}
      </div>
    </div>
  );
}
