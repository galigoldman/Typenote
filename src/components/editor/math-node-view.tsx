import { NodeViewWrapper } from '@tiptap/react';
import type { NodeViewProps } from '@tiptap/react';
import katex from 'katex';
import { useMemo } from 'react';

export function MathNodeView({ node }: NodeViewProps) {
  const latex = node.attrs.latex as string;

  const html = useMemo(() => {
    if (!latex) return '';
    try {
      return katex.renderToString(latex, {
        throwOnError: false,
        displayMode: false,
      });
    } catch {
      return `<span style="color: red;">${latex}</span>`;
    }
  }, [latex]);

  return (
    <NodeViewWrapper
      as="span"
      className="math-expression-node"
      style={{
        display: 'inline',
        background: 'rgba(139, 92, 246, 0.08)',
        border: '1px solid rgba(139, 92, 246, 0.2)',
        borderRadius: '4px',
        padding: '1px 4px',
        cursor: 'default',
      }}
    >
      <span dangerouslySetInnerHTML={{ __html: html }} />
    </NodeViewWrapper>
  );
}
