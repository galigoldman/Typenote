'use client';

import { useEffect, useRef, useState } from 'react';
import { BookOpen, Loader2, Send, Sparkles, X, Zap } from 'lucide-react';

import { Button } from '@/components/ui/button';

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
  cached?: boolean;
}

interface AiChatPanelProps {
  courseId: string;
  weekId?: string;
  isOpen: boolean;
  onClose: () => void;
}

export function AiChatPanel({
  courseId,
  weekId,
  isOpen,
  onClose,
}: AiChatPanelProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [mode, setMode] = useState<'quick' | 'deep'>('quick');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [isOpen]);

  async function handleSend() {
    const question = input.trim();
    if (!question || loading) return;

    const userMessage: ChatMessage = { role: 'user', content: question };
    setMessages((prev) => [...prev, userMessage]);
    setInput('');
    setLoading(true);

    try {
      const conversationHistory = messages.map((m) => ({
        role: m.role,
        content: m.content,
      }));

      const res = await fetch('/api/ai/ask', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          question,
          courseId,
          weekId,
          mode,
          conversationHistory,
        }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'Request failed' }));
        throw new Error(err.error || `HTTP ${res.status}`);
      }

      const data = await res.json();

      const assistantMessage: ChatMessage = {
        role: 'assistant',
        content: data.answer,
        sources: data.sources,
        model: data.model,
        cached: data.cached,
      };

      setMessages((prev) => [...prev, assistantMessage]);
    } catch (err) {
      const errorMessage: ChatMessage = {
        role: 'assistant',
        content: `Error: ${err instanceof Error ? err.message : 'Something went wrong'}`,
      };
      setMessages((prev) => [...prev, errorMessage]);
    } finally {
      setLoading(false);
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
          {weekId && (
            <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
              Full context
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
        {messages.length === 0 && (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <Sparkles className="mb-3 h-10 w-10 text-muted-foreground/40" />
            <p className="text-sm font-medium text-muted-foreground">
              Ask anything about your course materials
            </p>
            <p className="mt-1 text-xs text-muted-foreground/60">
              {weekId
                ? 'I can see all materials for this week'
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
                  <div className="whitespace-pre-wrap">{msg.content}</div>
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
                      {msg.model === 'flash' ? '⚡ Flash' : '🧠 Pro'}
                      {msg.cached ? ' · Cached' : ''}
                    </span>
                  </div>
                )}
              </div>
            )}
          </div>
        ))}

        {loading && (
          <div className="mb-4 flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            <span>Thinking...</span>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="border-t px-4 py-3">
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
            placeholder="Ask about your course materials..."
            disabled={loading}
            className="flex-1 rounded-lg border bg-background px-3 py-2 text-sm outline-none ring-offset-background placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
          />
          <Button
            type="submit"
            size="icon"
            disabled={loading || !input.trim()}
            className="h-9 w-9 shrink-0"
          >
            <Send className="h-4 w-4" />
          </Button>
        </form>
      </div>
    </div>
  );
}
