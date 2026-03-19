'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  BookOpen,
  ImageIcon,
  List,
  Loader2,
  Plus,
  Send,
  Sparkles,
  Square,
  X,
  Zap,
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import { MarkdownResponse } from './markdown-response';
import { ConversationList } from './conversation-list';

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
}: AiChatPanelProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [streamingText, setStreamingText] = useState('');
  const [mode, setMode] = useState<'quick' | 'deep'>('quick');
  const [quota, setQuota] = useState<QuotaInfo | null>(null);
  const [currentConversationId, setCurrentConversationId] = useState<
    string | null
  >(null);
  const [view, setView] = useState<'chat' | 'list'>('chat');
  const [loadingConversation, setLoadingConversation] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const initialLoadDone = useRef(false);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, streamingText]);

  useEffect(() => {
    if (isOpen && view === 'chat') {
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [isOpen, view]);

  // Load most recent conversation when panel opens
  useEffect(() => {
    if (!isOpen) {
      initialLoadDone.current = false;
      return;
    }
    if (initialLoadDone.current) return;
    initialLoadDone.current = true;

    async function loadMostRecent() {
      setLoadingConversation(true);
      try {
        const res = await fetch(`/api/ai/conversations?courseId=${courseId}`);
        if (!res.ok) return;
        const data = await res.json();
        const conversations = data.conversations || [];

        if (conversations.length > 0) {
          // Load the most recent conversation
          const latest = conversations[0];
          setCurrentConversationId(latest.id);

          const msgRes = await fetch(
            `/api/ai/conversations/${latest.id}/messages`,
          );
          if (msgRes.ok) {
            const msgData = await msgRes.json();
            const loadedMessages: ChatMessage[] = (msgData.messages || []).map(
              (m: {
                role: 'user' | 'assistant';
                content: string;
                sources_json?: ChatSource[] | null;
                model?: 'flash' | 'pro' | null;
              }) => ({
                role: m.role,
                content: m.content,
                sources: m.sources_json || undefined,
                model: m.model || undefined,
              }),
            );
            setMessages(loadedMessages);
          }
        } else {
          // No conversations — start fresh (defer creation to first message)
          setCurrentConversationId(null);
          setMessages([]);
        }
      } catch (err) {
        console.error('Failed to load conversations:', err);
      } finally {
        setLoadingConversation(false);
      }
    }

    loadMostRecent();
  }, [isOpen, courseId]);

  // Fetch quota when panel opens
  useEffect(() => {
    if (!isOpen) return;

    fetch('/api/ai/quota')
      .then((res) => (res.ok ? res.json() : null))
      .then((data: QuotaInfo | null) => {
        if (data) setQuota(data);
      })
      .catch(() => {
        setQuota(null);
      });
  }, [isOpen]);

  const handleStop = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  // Load a specific conversation by ID
  const loadConversation = useCallback(async (conversationId: string) => {
    setLoadingConversation(true);
    try {
      const res = await fetch(
        `/api/ai/conversations/${conversationId}/messages`,
      );
      if (!res.ok) throw new Error('Failed to load messages');
      const data = await res.json();
      const loadedMessages: ChatMessage[] = (data.messages || []).map(
        (m: {
          role: 'user' | 'assistant';
          content: string;
          sources_json?: ChatSource[] | null;
          model?: 'flash' | 'pro' | null;
        }) => ({
          role: m.role,
          content: m.content,
          sources: m.sources_json || undefined,
          model: m.model || undefined,
        }),
      );
      setMessages(loadedMessages);
      setCurrentConversationId(conversationId);
      setView('chat');
    } catch (err) {
      console.error('Failed to load conversation:', err);
    } finally {
      setLoadingConversation(false);
    }
  }, []);

  const handleNewConversation = useCallback(() => {
    setCurrentConversationId(null);
    setMessages([]);
    setStreamingText('');
    setView('chat');
    setTimeout(() => inputRef.current?.focus(), 100);
  }, []);

  const handleDeleteConversation = useCallback(
    (deletedId: string) => {
      // If the deleted conversation is the active one, start fresh
      if (deletedId === currentConversationId) {
        setCurrentConversationId(null);
        setMessages([]);
      }
    },
    [currentConversationId],
  );

  async function handleSend() {
    const question = input.trim();
    if (!question || loading) return;

    // Build question with accumulated context items
    const hasContext = pendingContextItems.length > 0;
    const textContexts = pendingContextItems.filter(
      (c): c is { type: 'text'; content: string } => c.type === 'text',
    );
    const imageContexts = pendingContextItems.filter(
      (c): c is { type: 'image'; dataUrl: string } => c.type === 'image',
    );

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

    let imageData: string | undefined;
    if (imageContexts.length > 0) {
      imageData = imageContexts[0].dataUrl.replace(
        /^data:image\/[a-z]+;base64,/,
        '',
      );
    }

    const contextSummary: string[] = [];
    if (hasContext) {
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
          // Server loads conversation history from DB if conversationId is set
          conversationId: currentConversationId || undefined,
          ...(imageData ? { imageData } : {}),
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
            } else if (event.type === 'conversation') {
              // Server created or confirmed the conversation
              if (event.conversationId) {
                setCurrentConversationId(event.conversationId);
              }
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
    <div className="fixed inset-0 z-50 flex h-full w-full flex-col border-l bg-background shadow-xl md:inset-auto md:right-0 md:top-0 md:w-[420px]">
      {/* Header */}
      <div className="flex items-center justify-between border-b px-4 py-3">
        <div className="flex items-center gap-2">
          <Sparkles className="h-5 w-5 text-purple-500" />
          <span className="font-semibold">AI Tutor</span>
          {currentConversationId && messages.length > 0 && (
            <span
              className="text-xs text-muted-foreground truncate max-w-[120px]"
              title={messages[0]?.content?.slice(0, 50)}
            >
              {messages[0]?.content?.slice(0, 30)}...
            </span>
          )}
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
          {/* Conversation list toggle */}
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setView(view === 'chat' ? 'list' : 'chat')}
            className={`h-8 w-8 ${view === 'list' ? 'bg-muted' : ''}`}
            aria-label="Conversation history"
          >
            <List className="h-4 w-4" />
          </Button>
          {/* New conversation */}
          <Button
            variant="ghost"
            size="icon"
            onClick={handleNewConversation}
            className="h-8 w-8"
            aria-label="New conversation"
          >
            <Plus className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={onClose}
            className="h-8 w-8 min-h-[44px] min-w-[44px]"
            aria-label="Close chat"
          >
            <X className="h-5 w-5" />
          </Button>
        </div>
      </div>

      {/* Conversation List View */}
      {view === 'list' ? (
        <ConversationList
          courseId={courseId}
          activeConversationId={currentConversationId}
          onSelect={loadConversation}
          onNew={handleNewConversation}
          onDelete={handleDeleteConversation}
        />
      ) : (
        <>
          {/* Chat Messages */}
          <div className="flex-1 overflow-y-auto px-4 py-4">
            {loadingConversation ? (
              <div className="flex items-center justify-center py-12 text-sm text-muted-foreground">
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Loading conversation...
              </div>
            ) : (
              <>
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
              </>
            )}
          </div>

          {/* Quota indicator + Input */}
          <div className="border-t px-4 py-3 pb-4">
            {quota && (
              <div className="mb-2">
                {quota.remaining === 0 ? (
                  <p className="text-xs text-destructive">
                    No questions remaining this month — resets{' '}
                    {new Date(quota.resetsAt).toLocaleDateString('en-US', {
                      month: 'long',
                      day: 'numeric',
                    })}
                  </p>
                ) : (
                  <p
                    className={`text-xs ${
                      quota.remaining <= 5
                        ? 'text-amber-500'
                        : 'text-muted-foreground'
                    }`}
                  >
                    {quota.remaining} of {quota.limit} questions remaining this
                    month
                  </p>
                )}
              </div>
            )}
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
                    ? 'Monthly limit reached'
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
        </>
      )}
    </div>
  );
}
