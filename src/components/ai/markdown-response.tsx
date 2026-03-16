'use client';

import Markdown from 'react-markdown';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import 'katex/dist/katex.min.css';

interface MarkdownResponseProps {
  content: string;
}

export function MarkdownResponse({ content }: MarkdownResponseProps) {
  if (!content) {
    return null;
  }

  return (
    <div className="prose prose-sm dark:prose-invert max-w-none leading-relaxed [&>*:first-child]:mt-0 [&>*:last-child]:mb-0">
      <Markdown remarkPlugins={[remarkMath]} rehypePlugins={[rehypeKatex]}>
        {content}
      </Markdown>
    </div>
  );
}
