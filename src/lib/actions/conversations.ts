'use server';

import { revalidatePath } from 'next/cache';

import { createClient } from '@/lib/supabase/server';
import type { AiConversation, AiMessage } from '@/types/database';

export async function createConversation(
  courseId: string,
  title: string,
): Promise<AiConversation> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');

  const { data: conversation, error } = await supabase
    .from('ai_conversations')
    .insert({
      user_id: user.id,
      course_id: courseId,
      title,
    })
    .select()
    .single();

  if (error) throw new Error(error.message);
  revalidatePath('/dashboard');
  return conversation;
}

export async function getConversations(
  courseId: string,
): Promise<AiConversation[]> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');

  const { data: conversations, error } = await supabase
    .from('ai_conversations')
    .select()
    .eq('course_id', courseId)
    .eq('user_id', user.id)
    .order('updated_at', { ascending: false });

  if (error) throw new Error(error.message);
  return conversations;
}

export async function getMessages(
  conversationId: string,
): Promise<AiMessage[]> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');

  const { data: messages, error } = await supabase
    .from('ai_messages')
    .select()
    .eq('conversation_id', conversationId)
    .order('created_at', { ascending: true });

  if (error) throw new Error(error.message);
  return messages;
}

export async function getRecentMessages(
  conversationId: string,
  limit: number = 20,
): Promise<AiMessage[]> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');

  const { data: messages, error } = await supabase
    .from('ai_messages')
    .select()
    .eq('conversation_id', conversationId)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) throw new Error(error.message);
  return messages.reverse();
}

export async function addMessage(
  conversationId: string,
  message: {
    role: 'user' | 'assistant';
    content: string;
    sources_json?: unknown[] | null;
    model?: string | null;
  },
): Promise<AiMessage> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');

  const { data: aiMessage, error: insertError } = await supabase
    .from('ai_messages')
    .insert({
      conversation_id: conversationId,
      role: message.role,
      content: message.content,
      sources_json: message.sources_json ?? null,
      model: message.model ?? null,
    })
    .select()
    .single();

  if (insertError) throw new Error(insertError.message);

  const { error: updateError } = await supabase
    .from('ai_conversations')
    .update({ updated_at: new Date().toISOString() })
    .eq('id', conversationId);

  if (updateError) throw new Error(updateError.message);

  return aiMessage;
}

export async function updateConversationTitle(
  conversationId: string,
  title: string,
): Promise<void> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');

  const { error } = await supabase
    .from('ai_conversations')
    .update({ title })
    .eq('id', conversationId)
    .eq('user_id', user.id);

  if (error) throw new Error(error.message);
  revalidatePath('/dashboard');
}

export async function deleteConversation(
  conversationId: string,
): Promise<void> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');

  const { error } = await supabase
    .from('ai_conversations')
    .delete()
    .eq('id', conversationId)
    .eq('user_id', user.id);

  if (error) throw new Error(error.message);
  revalidatePath('/dashboard');
}
