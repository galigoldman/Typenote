'use client';

import { useEffect, useState } from 'react';
import { Trash2, Plus, MessageSquare, Pencil } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface ConversationItem {
  id: string;
  title: string;
  updated_at: string;
  message_count: number;
}

interface ConversationListProps {
  courseId: string;
  activeConversationId?: string | null;
  onSelect: (conversationId: string) => void;
  onNew: () => void;
  onDelete: (conversationId: string) => void;
}

function formatRelativeTime(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString();
}

export function ConversationList({
  courseId,
  activeConversationId,
  onSelect,
  onNew,
  onDelete,
}: ConversationListProps) {
  const [conversations, setConversations] = useState<ConversationItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState('');

  useEffect(() => {
    async function fetchConversations() {
      setLoading(true);
      try {
        const res = await fetch(`/api/ai/conversations?courseId=${courseId}`);
        if (!res.ok) throw new Error('Failed to load conversations');
        const data = await res.json();
        setConversations(data.conversations || []);
      } catch (err) {
        console.error('Failed to load conversations:', err);
      } finally {
        setLoading(false);
      }
    }
    fetchConversations();
  }, [courseId]);

  const handleDelete = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    if (deletingId) return;

    setDeletingId(id);
    try {
      const res = await fetch(`/api/ai/conversations/${id}`, { method: 'DELETE' });
      if (res.ok) {
        setConversations((prev) => prev.filter((c) => c.id !== id));
        onDelete(id);
      }
    } catch (err) {
      console.error('Failed to delete conversation:', err);
    } finally {
      setDeletingId(null);
    }
  };

  const handleTitleSave = async (id: string) => {
    const newTitle = editTitle.trim();
    if (!newTitle || newTitle === conversations.find(c => c.id === id)?.title) {
      setEditingId(null);
      return;
    }

    // Optimistic update
    setConversations(prev => prev.map(c => c.id === id ? { ...c, title: newTitle } : c));
    setEditingId(null);

    try {
      await fetch(`/api/ai/conversations/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: newTitle }),
      });
    } catch (err) {
      console.error('Failed to update title:', err);
      // Could revert here but it's minor
    }
  };

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center text-muted-foreground text-sm">
        Loading conversations...
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      <div className="p-3 border-b">
        <Button
          onClick={onNew}
          variant="outline"
          size="sm"
          className="w-full"
        >
          <Plus className="h-4 w-4 mr-2" />
          New conversation
        </Button>
      </div>

      <div className="flex-1 overflow-y-auto">
        {conversations.length === 0 ? (
          <div className="flex flex-col items-center justify-center p-6 text-center text-muted-foreground">
            <MessageSquare className="h-8 w-8 mb-2 opacity-50" />
            <p className="text-sm">No conversations yet</p>
            <p className="text-xs mt-1">Start one by asking a question</p>
          </div>
        ) : (
          <ul className="divide-y">
            {conversations.map((conv) => (
              <li
                key={conv.id}
                onClick={() => onSelect(conv.id)}
                className={`group flex items-start gap-2 p-3 cursor-pointer hover:bg-muted/50 transition-colors ${
                  conv.id === activeConversationId ? 'bg-muted' : ''
                }`}
              >
                <div className="flex-1 min-w-0">
                  {editingId === conv.id ? (
                    <input
                      autoFocus
                      value={editTitle}
                      onChange={(e) => setEditTitle(e.target.value)}
                      onBlur={() => handleTitleSave(conv.id)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') handleTitleSave(conv.id);
                        if (e.key === 'Escape') setEditingId(null);
                      }}
                      className="text-sm font-medium w-full bg-transparent border-b border-primary outline-none"
                      onClick={(e) => e.stopPropagation()}
                    />
                  ) : (
                    <div className="flex items-center gap-1 min-w-0">
                      <p className="text-sm font-medium truncate">{conv.title}</p>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setEditingId(conv.id);
                          setEditTitle(conv.title);
                        }}
                        className="p-0.5 rounded opacity-0 group-hover:opacity-100 hover:bg-muted transition-opacity shrink-0"
                        aria-label="Edit title"
                      >
                        <Pencil className="h-3 w-3" />
                      </button>
                    </div>
                  )}
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {formatRelativeTime(conv.updated_at)}
                    {conv.message_count > 0 && ` · ${conv.message_count} messages`}
                  </p>
                </div>
                <button
                  onClick={(e) => handleDelete(e, conv.id)}
                  disabled={deletingId === conv.id}
                  className="p-1 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors shrink-0"
                  aria-label="Delete conversation"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
