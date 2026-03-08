'use client';

import { useEffect, useRef, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import type { RealtimeChannel } from '@supabase/supabase-js';

export type ConnectionStatus = 'connected' | 'connecting' | 'disconnected';

interface UseRealtimeSyncOptions {
  documentId: string;
  lastSaveTimestampRef: React.RefObject<string | null>;
  onRemoteContentUpdate: (content: Record<string, unknown>) => void;
  onRemoteTitleUpdate: (title: string) => void;
  onRemotePagesUpdate?: (pages: Record<string, unknown>) => void;
}

export function useRealtimeSync({
  documentId,
  lastSaveTimestampRef,
  onRemoteContentUpdate,
  onRemoteTitleUpdate,
  onRemotePagesUpdate,
}: UseRealtimeSyncOptions) {
  const [connectionStatus, setConnectionStatus] =
    useState<ConnectionStatus>('connecting');
  const channelRef = useRef<RealtimeChannel | null>(null);

  // Keep callbacks in refs to avoid re-subscribing
  const onRemoteContentRef = useRef(onRemoteContentUpdate);
  const onRemoteTitleRef = useRef(onRemoteTitleUpdate);
  const onRemotePagesRef = useRef(onRemotePagesUpdate);

  useEffect(() => {
    onRemoteContentRef.current = onRemoteContentUpdate;
  }, [onRemoteContentUpdate]);

  useEffect(() => {
    onRemoteTitleRef.current = onRemoteTitleUpdate;
  }, [onRemoteTitleUpdate]);

  useEffect(() => {
    onRemotePagesRef.current = onRemotePagesUpdate;
  }, [onRemotePagesUpdate]);

  useEffect(() => {
    const supabase = createClient();

    const channel = supabase
      .channel(`document:${documentId}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'documents',
          filter: `id=eq.${documentId}`,
        },
        (payload) => {
          const newRecord = payload.new as {
            updated_at: string;
            content: Record<string, unknown>;
            title: string;
            pages?: Record<string, unknown>;
          };

          // Echo guard: if this update came from our own save, ignore it
          if (newRecord.updated_at === lastSaveTimestampRef.current) {
            return;
          }

          onRemoteContentRef.current(newRecord.content);
          onRemoteTitleRef.current(newRecord.title);
          if (newRecord.pages && onRemotePagesRef.current) {
            onRemotePagesRef.current(newRecord.pages);
          }
        },
      )
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          setConnectionStatus('connected');
        } else if (status === 'CLOSED' || status === 'CHANNEL_ERROR') {
          setConnectionStatus('disconnected');
        } else {
          setConnectionStatus('connecting');
        }
      });

    channelRef.current = channel;

    return () => {
      supabase.removeChannel(channel);
    };
  }, [documentId, lastSaveTimestampRef]);

  return { connectionStatus };
}
