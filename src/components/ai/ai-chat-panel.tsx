'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  BookOpen,
  Loader2,
  Send,
  Sparkles,
  Square,
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

interface QuotaInfo {
  used: number;
  limit: number;
  remaining: number;
  tier: string;
  resetsAt: string;
}

interface AiChatPanelProps {
  courseId: string;
  weekId?: string;
  courseName?: string;
  weekLabel?: string;
  getDocumentContent?: () => string;
  isOpen: boolean;
  onClose: () => void;
}

export function AiChatPanel({
  courseId,
  weekId,
  courseName,
  weekLabel,
  getDocumentContent,
  isOpen,
  onClose,
}: AiChatPanelProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [streamingText, setStreamingText] = useState('');
  const [mode, setMode] = useState<'quick' | 'deep'>('quick');
  const [quota, setQuota] = useState<QuotaInfo | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, streamingText]);

  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [isOpen]);

  // Fetch quota when panel opens
  useEffect(() => {
    if (!isOpen) return;

    fetch('/api/ai/quota')
      .then((res) => (res.ok ? res.json() : null))
      .then((data: QuotaInfo | null) => {
        if (data) setQuota(data);
      })
      .catch(() => {
        // Quota display is non-critical — enforcement is server-side
        setQuota(null);
      });
  }, [isOpen]);

  const handleStop = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  async function handleSend() {
    const question = input.trim();
    if (!question || loading) return;

    const userMessage: ChatMessage = { role: 'user', content: question };
    setMessages((prev) => [...prev, userMessage]);
    setInput('');
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
          question,
          courseId,
          weekId,
          mode,
          courseName,
          weekLabel,
          documentContent,
          conversationHistory,
        }),
        signal: controller.signal,
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'Request failed' }));

        // Handle rate limit (429) with friendly message
        if (res.status === 429 && err.error === 'rate_limited') {
          setQuota((prev) =>
            prev
              ? { ...prev, used: err.used, limit: err.limit, remaining: 0 }
              : {
                  used: err.used,
                  limit: err.limit,
                  remaining: 0,
                  tier: 'free',
                  resetsAt: err.resetsAt,
                },
          );
          setMessages((prev) => [
            ...prev,
            { role: 'assistant', content: err.message },
          ]);
          setLoading(false);
          abortRef.current = null;
          return;
        }

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

        // Parse SSE events from buffer
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

      // Finalize: move streaming text to a proper message
      setStreamingText('');
      if (accumulatedText) {
        setMessages((prev) => [
          ...prev,
          {
            role: 'assistant',
            content: accumulatedText,
            sources,
            model,
          },
        ]);

        // Optimistically decrement quota after successful question
        setQuota((prev) =>
          prev
            ? {
                ...prev,
                used: prev.used + 1,
                remaining: Math.max(0, prev.remaining - 1),
              }
            : null,
        );
      }
    } catch (err) {
      setStreamingText('');
      if (err instanceof DOMException && err.name === 'AbortError') {
        // User stopped the generation — keep what we have
        if (accumulatedText) {
          setMessages((prev) => [
            ...prev,
            {
              role: 'assistant',
              content: accumulatedText,
              sources,
              model,
            },
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
              <div className="max-w-[85%] rounded-2xl rounded-br-md bg-primary px-4 py-2.5 text-sm text-primary-foreground">
                {msg.content}
              </div>
            ) : (
              <div className="max-w-[95%]">
                <div className="rounded-2xl rounded-bl-md bg-muted px-4 py-3 text-sm leading-relaxed">
                  <MarkdownResponse content={msg.content} />
                </div>

                {/* Sources */}
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

                {/* Model badge */}
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

        {/* Streaming message */}
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

      {/* Quota indicator + Input */}
      <div className="border-t px-4 py-3">
        {quota && (
          <div className="mb-2">
            {quota.remaining === 0 ? (
              <p className="text-xs text-destructive">
                No questions remaining — resets at midnight UTC
              </p>
            ) : (
              <p
                className={`text-xs ${
                  quota.remaining <= 5
                    ? 'text-amber-500'
                    : 'text-muted-foreground'
                }`}
              >
                {quota.remaining} of {quota.limit} questions remaining today
              </p>
            )}
          </div>
        )}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleSend();
          }}
          className="flex gap-2"
        >
          <input
            ref={inputRef}
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={
              quota?.remaining === 0
                ? 'Daily limit reached'
                : 'Ask about your course materials...'
            }
            disabled={loading || quota?.remaining === 0}
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
              disabled={!input.trim() || quota?.remaining === 0}
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
