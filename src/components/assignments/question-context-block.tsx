'use client';

import { NodeViewWrapper } from '@tiptap/react';

export function QuestionContextBlockView({
  node,
  deleteNode,
}: {
  node: { attrs: { label: string; html: string; preambleHtml: string | null } };
  deleteNode: () => void;
}) {
  return (
    <NodeViewWrapper>
      <div
        className="my-3 rounded-lg border border-blue-200 bg-blue-50 dark:border-blue-800 dark:bg-blue-950 p-4 relative"
        contentEditable={false}
      >
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs font-semibold text-blue-600 dark:text-blue-400 uppercase tracking-wide">
            Question {node.attrs.label}
          </span>
          <button
            onClick={deleteNode}
            className="text-xs text-muted-foreground hover:text-destructive"
            title="Remove question block"
          >
            ×
          </button>
        </div>
        {node.attrs.preambleHtml && (
          <div
            className="text-sm text-muted-foreground mb-2 pb-2 border-b border-blue-100 dark:border-blue-900"
            dangerouslySetInnerHTML={{ __html: node.attrs.preambleHtml }}
          />
        )}
        <div
          className="text-sm prose prose-sm dark:prose-invert max-w-none"
          dangerouslySetInnerHTML={{ __html: node.attrs.html }}
        />
      </div>
    </NodeViewWrapper>
  );
}
