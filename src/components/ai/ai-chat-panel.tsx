'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  BookOpen,
  Camera,
  ImageIcon,
  Loader2,
  Send,
  Sparkles,
  Square,
  Type as TypeIcon,
  X,
  Zap,
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import { MarkdownResponse } from './markdown-response';

interface ChatSource {
  sourceType: string;
  sourceName: string;
  weekId: string | null;
  pageRange: string | null;
}

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  sources?: ChatSource[];
  model?: 'flash' | 'pro';
}

export type AiContextItem =
  | { type: 'text'; content: string }
  | { type: 'image'; dataUrl: string };

interface AiChatPanelProps {
  courseId: string;
  weekId?: string;
  courseName?: string;
  weekLabel?: string;
  getDocumentContent?: () => string;
  isOpen: boolean;
  onClose: () => void;
  pendingContextItems: AiContextItem[];
  onRemoveContextItem?: (index: number) => void;
  onClearAllContext?: () => void;
  onRequestMarkText?: () => void;
  onRequestScreenshot?: () => void;
}

export function AiChatPanel({
  courseId,
  weekId,
  courseName,
  weekLabel,
  getDocumentContent,
  isOpen,
  onClose,
  pendingContextItems,
  onRemoveContextItem,
  onClearAllContext,
  onRequestMarkText,
  onRequestScreenshot,
}: AiChatPanelProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [streamingText, setStreamingText] = useState('');
  const [mode, setMode] = useState<'quick' | 'deep'>('quick');
  const [showCropMenu, setShowCropMenu] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const cropMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, streamingText]);

  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [isOpen]);

  // Close crop menu on outside click
  useEffect(() => {
    if (!showCropMenu) return;
    const handleClick = (e: MouseEvent) => {
      if (
        cropMenuRef.current &&
        !cropMenuRef.current.contains(e.target as Node)
      ) {
        setShowCropMenu(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [showCropMenu]);

  const handleStop = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  async function handleSend() {
    const question = input.trim();
    if (!question || loading) return;

    const hasContext = pendingContextItems.length > 0;
    const textContexts = pendingContextItems.filter(
      (c) => c.type === 'text',
    ) as Array<{ type: 'text'; content: string }>;
    const imageContexts = pendingContextItems.filter(
      (c) => c.type === 'image',
    ) as Array<{ type: 'image'; dataUrl: string }>;

    // Build full question with all text contexts
    let fullQuestion = question;
    if (textContexts.length > 0) {
      const quotedTexts = textContexts
        .map((c, i) =>
          textContexts.length > 1
            ? `[Selection ${i + 1}]:\n"${c.content}"`
            : `"${c.content}"`,
        )
        .join('\n\n');
      fullQuestion = `Regarding this text:\n${quotedTexts}\n\n${question}`;
    }

    // Use the first image context (Gemini accepts one image per turn)
    let imageData: string | undefined;
    if (imageContexts.length > 0) {
      imageData = imageContexts[0].dataUrl.replace(
        /^data:image\/[a-z]+;base64,/,
        '',
      );
    }

    // Build display content for the message bubble
    const contextSummary: string[] = [];
    for (const ctx of pendingContextItems) {
      if (ctx.type === 'text') {
        const preview =
          ctx.content.length > 100
            ? ctx.content.slice(0, 100) + '...'
            : ctx.content;
        contextSummary.push(`> ${preview}`);
      } else {
        contextSummary.push('[Screenshot attached]');
      }
    }
    const displayContent = hasContext
      ? `${contextSummary.join('\n')}\n\n${question}`
      : question;

    const userMessage: ChatMessage = { role: 'user', content: displayContent };
    setMessages((prev) => [...prev, userMessage]);
    setInput('');
    onClearAllContext?.();
    setLoading(true);
    setStreamingText('');

    const controller = new AbortController();
    abortRef.current = controller;

    let accumulatedText = '';
    let sources: ChatSource[] = [];
    let model: 'flash' | 'pro' = 'flash';

    try {
      const conversationHistory = messages.map((m) => ({
        role: m.role,
        content: m.content,
      }));

      const documentContent = getDocumentContent?.() || undefined;

      const res = await fetch('/api/ai/ask', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          question: fullQuestion,
          courseId,
          weekId,
          mode,
          courseName,
          weekLabel,
          documentContent,
          conversationHistory,
          ...(imageData ? { imageData } : {}),
        }),
        signal: controller.signal,
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'Request failed' }));
        throw new Error(err.error || `HTTP ${res.status}`);
      }

      const reader = res.body?.getReader();
      if (!reader) throw new Error('No response stream');

      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });

        const lines = buffer.split('\n\n');
        buffer = lines.pop() ?? '';

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          const jsonStr = line.slice(6);
          try {
            const event = JSON.parse(jsonStr);
            if (event.type === 'sources') {
              sources = event.sources ?? [];
              model = event.model ?? 'flash';
            } else if (event.type === 'text') {
              accumulatedText += event.text;
              setStreamingText(accumulatedText);
            } else if (event.type === 'error') {
              throw new Error(event.error);
            }
          } catch (e) {
            if (e instanceof SyntaxError) continue;
            throw e;
          }
        }
      }

      setStreamingText('');
      if (accumulatedText) {
        setMessages((prev) => [
          ...prev,
          { role: 'assistant', content: accumulatedText, sources, model },
        ]);
      }
    } catch (err) {
      setStreamingText('');
      if (err instanceof DOMException && err.name === 'AbortError') {
        if (accumulatedText) {
          setMessages((prev) => [
            ...prev,
            { role: 'assistant', content: accumulatedText, sources, model },
          ]);
        }
      } else {
        setMessages((prev) => [
          ...prev,
          {
            role: 'assistant',
            content: `Error: ${err instanceof Error ? err.message : 'Something went wrong'}`,
          },
        ]);
      }
    } finally {
      setLoading(false);
      abortRef.current = null;
    }
  }

  if (!isOpen) return null;

  return (
    <div className="fixed right-0 top-0 z-50 flex h-full w-[420px] flex-col border-l bg-background shadow-xl">
      {/* Header */}
      <div className="flex items-center justify-between border-b px-4 py-3">
        <div className="flex items-center gap-2">
          <Sparkles className="h-5 w-5 text-purple-500" />
          <span className="font-semibold">AI Tutor</span>
          {weekLabel && (
            <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
              {weekLabel}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {/* Mode toggle */}
          <div className="flex rounded-lg border bg-muted p-0.5">
            <button
              onClick={() => setMode('quick')}
              className={`flex items-center gap-1 rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
                mode === 'quick'
                  ? 'bg-background text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              <Zap className="h-3 w-3" />
              Quick
            </button>
            <button
              onClick={() => setMode('deep')}
              className={`flex items-center gap-1 rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
                mode === 'deep'
                  ? 'bg-background text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              <BookOpen className="h-3 w-3" />
              Deep
            </button>
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={onClose}
            className="h-8 w-8"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-4">
        {messages.length === 0 && !streamingText && (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <Sparkles className="mb-3 h-10 w-10 text-muted-foreground/40" />
            <p className="text-sm font-medium text-muted-foreground">
              {courseName
                ? `Ask anything about ${courseName}`
                : 'Ask anything about your course materials'}
            </p>
            <p className="mt-1 text-xs text-muted-foreground/60">
              {weekLabel
                ? `I can see all materials for ${weekLabel}`
                : "I'll search across all weeks"}
            </p>
          </div>
        )}

        {messages.map((msg, i) => (
          <div
            key={i}
            className={`mb-4 ${msg.role === 'user' ? 'flex justify-end' : ''}`}
          >
            {msg.role === 'user' ? (
              <div className="max-w-[85%] rounded-2xl rounded-br-md bg-primary px-4 py-2.5 text-sm text-primary-foreground whitespace-pre-line">
                {msg.content}
              </div>
            ) : (
              <div className="max-w-[95%]">
                <div className="rounded-2xl rounded-bl-md bg-muted px-4 py-3 text-sm leading-relaxed">
                  <MarkdownResponse content={msg.content} />
                </div>

                {msg.sources && msg.sources.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {msg.sources.map((src, j) => (
                      <span
                        key={j}
                        className="inline-flex items-center gap-1 rounded-full border bg-background px-2.5 py-0.5 text-[10px] text-muted-foreground"
                      >
                        <BookOpen className="h-2.5 w-2.5" />
                        {src.sourceName}
                        {src.pageRange && ` (${src.pageRange})`}
                      </span>
                    ))}
                  </div>
                )}

                {msg.model && (
                  <div className="mt-1.5 flex items-center gap-2">
                    <span className="text-[10px] text-muted-foreground/50">
                      {msg.model === 'flash' ? 'Flash' : 'Pro'}
                    </span>
                  </div>
                )}
              </div>
            )}
          </div>
        ))}

        {streamingText && (
          <div className="mb-4">
            <div className="max-w-[95%]">
              <div className="rounded-2xl rounded-bl-md bg-muted px-4 py-3 text-sm leading-relaxed">
                <MarkdownResponse content={streamingText} />
              </div>
            </div>
          </div>
        )}

        {loading && !streamingText && (
          <div className="mb-4 flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            <span>Searching materials...</span>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input area */}
      <div className="border-t px-4 py-3">
        {/* Pending context items (accumulated) */}
        {pendingContextItems.length > 0 && (
          <div className="mb-2 space-y-1.5">
            {pendingContextItems.map((ctx, idx) => (
              <div
                key={idx}
                className="flex items-start gap-2 rounded-lg border bg-muted/50 p-2"
              >
                {ctx.type === 'text' ? (
                  <div className="flex-1 min-w-0 border-l-2 border-purple-400 pl-2">
                    <p className="text-xs font-medium text-muted-foreground mb-0.5">
                      Selected text
                    </p>
                    <p className="text-xs text-foreground line-clamp-2">
                      {ctx.content}
                    </p>
                  </div>
                ) : (
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium text-muted-foreground mb-1">
                      <ImageIcon className="inline h-3 w-3 mr-1" />
                      Screenshot
                    </p>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={ctx.dataUrl}
                      alt="Region capture"
                      className="max-h-20 rounded border object-contain"
                    />
                  </div>
                )}
                <button
                  onClick={() => onRemoveContextItem?.(idx)}
                  className="shrink-0 rounded-full p-0.5 text-muted-foreground hover:bg-background hover:text-foreground"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Input row with Ask AI button */}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleSend();
          }}
          className="flex gap-2"
        >
          {/* Ask AI crop button */}
          <div className="relative" ref={cropMenuRef}>
            <Button
              type="button"
              size="icon"
              variant="outline"
              onClick={() => setShowCropMenu((prev) => !prev)}
              className="h-9 w-9 shrink-0 text-purple-600 border-purple-200 hover:bg-purple-50"
              title="Ask AI about content"
            >
              <Sparkles className="h-4 w-4" />
            </Button>

            {/* Dropdown menu */}
            {showCropMenu && (
              <div className="absolute bottom-full left-0 mb-2 w-44 rounded-lg border bg-popover p-1 shadow-lg">
                <button
                  type="button"
                  onClick={() => {
                    setShowCropMenu(false);
                    onRequestMarkText?.();
                  }}
                  className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm hover:bg-accent transition-colors"
                >
                  <TypeIcon className="h-4 w-4 text-purple-500" />
                  Mark Text
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowCropMenu(false);
                    onRequestScreenshot?.();
                  }}
                  className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm hover:bg-accent transition-colors"
                >
                  <Camera className="h-4 w-4 text-purple-500" />
                  Screenshot
                </button>
              </div>
            )}
          </div>

          <input
            ref={inputRef}
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask about your course materials..."
            disabled={loading}
            className="flex-1 rounded-lg border bg-background px-3 py-2 text-sm outline-none ring-offset-background placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
          />
          {loading ? (
            <Button
              type="button"
              size="icon"
              variant="destructive"
              onClick={handleStop}
              className="h-9 w-9 shrink-0"
            >
              <Square className="h-3.5 w-3.5" />
            </Button>
          ) : (
            <Button
              type="submit"
              size="icon"
              disabled={!input.trim()}
              className="h-9 w-9 shrink-0"
            >
              <Send className="h-4 w-4" />
            </Button>
          )}
        </form>
      </div>
    </div>
  );
}
