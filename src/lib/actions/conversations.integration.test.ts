/**
 * Integration test: verifies AI conversation and message CRUD operations,
 * ordering, pagination, and CASCADE delete behavior against the real database.
 *
 * Uses the admin (service_role) client which bypasses RLS.
 * We cannot call the server actions directly (they depend on Next.js cookies),
 * so we test the equivalent database operations using the Supabase client.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createAdminClient, TEST_USER_ID } from '@/test/supabase-client';

let supabase: SupabaseClient;

const COURSE_ID = '30000000-0000-0000-0000-000000000001'; // CS101 from seed

// Track conversation IDs created during tests for cleanup
const createdConversationIds: string[] = [];

// We also create a temporary course for the cascade test
let cascadeCourseId: string;

beforeAll(() => {
  supabase = createAdminClient();
});

afterAll(async () => {
  // Clean up conversations created during tests (messages cascade automatically)
  for (const id of createdConversationIds) {
    await supabase.from('ai_conversations').delete().eq('id', id);
  }

  // Clean up the temporary course if it still exists
  if (cascadeCourseId) {
    await supabase.from('courses').delete().eq('id', cascadeCourseId);
  }
});

describe('Create conversation', () => {
  it('inserts a conversation and returns id, user_id, course_id, title', async () => {
    const { data, error } = await supabase
      .from('ai_conversations')
      .insert({
        user_id: TEST_USER_ID,
        course_id: COURSE_ID,
        title: 'Test conversation',
      })
      .select()
      .single();

    expect(error).toBeNull();
    expect(data).toBeDefined();
    expect(data!.id).toBeDefined();
    expect(data!.user_id).toBe(TEST_USER_ID);
    expect(data!.course_id).toBe(COURSE_ID);
    expect(data!.title).toBe('Test conversation');
    expect(data!.created_at).toBeDefined();
    expect(data!.updated_at).toBeDefined();

    createdConversationIds.push(data!.id);
  });
});

describe('List conversations by course', () => {
  let convIds: string[];

  beforeAll(async () => {
    // Create 3 conversations with staggered updated_at timestamps
    const titles = ['Conv Alpha', 'Conv Beta', 'Conv Gamma'];
    const timestamps = [
      '2026-01-01T10:00:00Z',
      '2026-01-03T10:00:00Z',
      '2026-01-02T10:00:00Z',
    ];
    convIds = [];

    for (let i = 0; i < 3; i++) {
      const { data, error } = await supabase
        .from('ai_conversations')
        .insert({
          user_id: TEST_USER_ID,
          course_id: COURSE_ID,
          title: titles[i],
          updated_at: timestamps[i],
        })
        .select()
        .single();

      expect(error).toBeNull();
      convIds.push(data!.id);
      createdConversationIds.push(data!.id);
    }
  });

  it('returns conversations sorted by updated_at DESC', async () => {
    const { data, error } = await supabase
      .from('ai_conversations')
      .select()
      .eq('course_id', COURSE_ID)
      .eq('user_id', TEST_USER_ID)
      .in('id', convIds)
      .order('updated_at', { ascending: false });

    expect(error).toBeNull();
    expect(data).toBeDefined();
    expect(data!.length).toBe(3);

    // Beta (Jan 3) should be first, Gamma (Jan 2) second, Alpha (Jan 1) third
    expect(data![0].title).toBe('Conv Beta');
    expect(data![1].title).toBe('Conv Gamma');
    expect(data![2].title).toBe('Conv Alpha');

    // Verify timestamps are actually descending
    for (let i = 0; i < data!.length - 1; i++) {
      const current = new Date(data![i].updated_at).getTime();
      const next = new Date(data![i + 1].updated_at).getTime();
      expect(current).toBeGreaterThanOrEqual(next);
    }
  });
});

describe('Add messages', () => {
  let conversationId: string;

  beforeAll(async () => {
    const { data } = await supabase
      .from('ai_conversations')
      .insert({
        user_id: TEST_USER_ID,
        course_id: COURSE_ID,
        title: 'Message test conversation',
      })
      .select()
      .single();

    conversationId = data!.id;
    createdConversationIds.push(conversationId);
  });

  it('inserts a user message without sources', async () => {
    const { data, error } = await supabase
      .from('ai_messages')
      .insert({
        conversation_id: conversationId,
        role: 'user',
        content: 'What is a variable?',
        sources_json: null,
        model: null,
      })
      .select()
      .single();

    expect(error).toBeNull();
    expect(data).toBeDefined();
    expect(data!.id).toBeDefined();
    expect(data!.conversation_id).toBe(conversationId);
    expect(data!.role).toBe('user');
    expect(data!.content).toBe('What is a variable?');
    expect(data!.sources_json).toBeNull();
    expect(data!.model).toBeNull();
    expect(data!.created_at).toBeDefined();
  });

  it('inserts an assistant message with sources_json and model', async () => {
    const sources = [
      {
        sourceType: 'course_material',
        sourceName: 'lecture-1.pdf',
        pageRange: '1-5',
      },
    ];

    const { data, error } = await supabase
      .from('ai_messages')
      .insert({
        conversation_id: conversationId,
        role: 'assistant',
        content: 'A variable is a named container for data.',
        sources_json: sources,
        model: 'flash',
      })
      .select()
      .single();

    expect(error).toBeNull();
    expect(data).toBeDefined();
    expect(data!.role).toBe('assistant');
    expect(data!.model).toBe('flash');
    expect(data!.sources_json).toEqual(sources);
  });

  it('rejects invalid role values', async () => {
    const { error } = await supabase
      .from('ai_messages')
      .insert({
        conversation_id: conversationId,
        role: 'system', // not in CHECK constraint
        content: 'This should fail',
      })
      .select()
      .single();

    expect(error).not.toBeNull();
    // CHECK constraint violation code
    expect(error!.code).toBe('23514');
  });
});

describe('Load messages in chronological order', () => {
  let conversationId: string;

  beforeAll(async () => {
    const { data } = await supabase
      .from('ai_conversations')
      .insert({
        user_id: TEST_USER_ID,
        course_id: COURSE_ID,
        title: 'Chronological order test',
      })
      .select()
      .single();

    conversationId = data!.id;
    createdConversationIds.push(conversationId);

    // Insert messages with explicit staggered timestamps (out of order)
    const messages = [
      {
        conversation_id: conversationId,
        role: 'user',
        content: 'Third message',
        created_at: '2026-02-01T12:00:00Z',
      },
      {
        conversation_id: conversationId,
        role: 'assistant',
        content: 'First message',
        created_at: '2026-02-01T10:00:00Z',
      },
      {
        conversation_id: conversationId,
        role: 'user',
        content: 'Second message',
        created_at: '2026-02-01T11:00:00Z',
      },
    ];

    const { error } = await supabase.from('ai_messages').insert(messages);
    expect(error).toBeNull();
  });

  it('returns messages in ascending created_at order', async () => {
    const { data, error } = await supabase
      .from('ai_messages')
      .select()
      .eq('conversation_id', conversationId)
      .order('created_at', { ascending: true });

    expect(error).toBeNull();
    expect(data).toHaveLength(3);
    expect(data![0].content).toBe('First message');
    expect(data![1].content).toBe('Second message');
    expect(data![2].content).toBe('Third message');

    // Verify timestamps are actually ascending
    for (let i = 0; i < data!.length - 1; i++) {
      const current = new Date(data![i].created_at).getTime();
      const next = new Date(data![i + 1].created_at).getTime();
      expect(current).toBeLessThan(next);
    }
  });
});

describe('Get recent messages (limit 20)', () => {
  let conversationId: string;

  beforeAll(async () => {
    const { data } = await supabase
      .from('ai_conversations')
      .insert({
        user_id: TEST_USER_ID,
        course_id: COURSE_ID,
        title: 'Pagination test',
      })
      .select()
      .single();

    conversationId = data!.id;
    createdConversationIds.push(conversationId);

    // Insert 25 messages with sequential timestamps
    const messages = Array.from({ length: 25 }, (_, i) => ({
      conversation_id: conversationId,
      role: i % 2 === 0 ? 'user' : 'assistant',
      content: `Message ${String(i + 1).padStart(2, '0')}`,
      created_at: new Date(
        Date.UTC(2026, 0, 1, 0, 0, 0) + i * 60_000,
      ).toISOString(),
    }));

    const { error } = await supabase.from('ai_messages').insert(messages);
    expect(error).toBeNull();
  });

  it('returns only the 20 most recent messages', async () => {
    // Replicate the getRecentMessages logic: fetch the 20 newest DESC,
    // then reverse so they appear in chronological order
    const { data, error } = await supabase
      .from('ai_messages')
      .select()
      .eq('conversation_id', conversationId)
      .order('created_at', { ascending: false })
      .limit(20);

    expect(error).toBeNull();
    expect(data).toHaveLength(20);

    // Reverse for chronological order (as the server action does)
    const chronological = data!.reverse();

    // The oldest returned message should be #6 (messages 1-5 are excluded)
    expect(chronological[0].content).toBe('Message 06');
    // The newest should be #25
    expect(chronological[19].content).toBe('Message 25');
  });

  it('returns all messages when fewer than the limit exist', async () => {
    // Create a conversation with only 3 messages
    const { data: conv } = await supabase
      .from('ai_conversations')
      .insert({
        user_id: TEST_USER_ID,
        course_id: COURSE_ID,
        title: 'Small conversation',
      })
      .select()
      .single();

    createdConversationIds.push(conv!.id);

    await supabase.from('ai_messages').insert([
      { conversation_id: conv!.id, role: 'user', content: 'Hello' },
      { conversation_id: conv!.id, role: 'assistant', content: 'Hi there' },
      { conversation_id: conv!.id, role: 'user', content: 'Bye' },
    ]);

    const { data, error } = await supabase
      .from('ai_messages')
      .select()
      .eq('conversation_id', conv!.id)
      .order('created_at', { ascending: false })
      .limit(20);

    expect(error).toBeNull();
    expect(data).toHaveLength(3);
  });
});

describe('Delete conversation cascades to messages', () => {
  it('deleting a conversation also deletes its messages', async () => {
    // Create a conversation
    const { data: conv } = await supabase
      .from('ai_conversations')
      .insert({
        user_id: TEST_USER_ID,
        course_id: COURSE_ID,
        title: 'Cascade delete test',
      })
      .select()
      .single();

    const conversationId = conv!.id;

    // Add messages to it
    const { error: msgError } = await supabase.from('ai_messages').insert([
      {
        conversation_id: conversationId,
        role: 'user',
        content: 'This should be deleted',
      },
      {
        conversation_id: conversationId,
        role: 'assistant',
        content: 'This too',
      },
    ]);
    expect(msgError).toBeNull();

    // Verify messages exist
    const { data: before } = await supabase
      .from('ai_messages')
      .select('id')
      .eq('conversation_id', conversationId);
    expect(before).toHaveLength(2);

    // Delete the conversation
    const { error: deleteError } = await supabase
      .from('ai_conversations')
      .delete()
      .eq('id', conversationId);
    expect(deleteError).toBeNull();

    // Verify messages are gone (CASCADE)
    const { data: after } = await supabase
      .from('ai_messages')
      .select('id')
      .eq('conversation_id', conversationId);
    expect(after).toHaveLength(0);

    // No need to track for cleanup — already deleted
  });
});

describe('Course deletion cascades to conversations', () => {
  it('deleting a course also deletes its conversations and their messages', async () => {
    // Create a temporary course
    const { data: course, error: courseError } = await supabase
      .from('courses')
      .insert({
        user_id: TEST_USER_ID,
        name: 'Temp Course for Cascade Test',
        code: 'TEMP999',
        semester: 'Test',
        color: '#000000',
        position: 999,
      })
      .select()
      .single();

    expect(courseError).toBeNull();
    cascadeCourseId = course!.id;

    // Create a conversation in that course
    const { data: conv, error: convError } = await supabase
      .from('ai_conversations')
      .insert({
        user_id: TEST_USER_ID,
        course_id: cascadeCourseId,
        title: 'Conversation in temp course',
      })
      .select()
      .single();

    expect(convError).toBeNull();
    const conversationId = conv!.id;

    // Add messages
    await supabase.from('ai_messages').insert([
      {
        conversation_id: conversationId,
        role: 'user',
        content: 'Message in temp course',
      },
      {
        conversation_id: conversationId,
        role: 'assistant',
        content: 'Reply in temp course',
      },
    ]);

    // Delete the course
    const { error: deleteError } = await supabase
      .from('courses')
      .delete()
      .eq('id', cascadeCourseId);
    expect(deleteError).toBeNull();

    // Verify conversation is gone
    const { data: convAfter } = await supabase
      .from('ai_conversations')
      .select('id')
      .eq('id', conversationId);
    expect(convAfter).toHaveLength(0);

    // Verify messages are gone
    const { data: msgAfter } = await supabase
      .from('ai_messages')
      .select('id')
      .eq('conversation_id', conversationId);
    expect(msgAfter).toHaveLength(0);

    // Already deleted, clear the reference so afterAll doesn't try again
    cascadeCourseId = '';
  });
});

// Real cross-user RLS isolation is tested in
// src/__tests__/integration/rls-isolation.integration.test.ts using two
// anon-key clients with different user JWTs. Placeholder tests previously
// here only verified the table was queryable by the admin client (which
// bypasses RLS), so they could not detect a missing or broken policy.
