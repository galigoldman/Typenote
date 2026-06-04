# Course Sharing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let any course be shared via a link so its imported-file materials are visible to members (Viewer/Contributor roles), while each member's personal notes stay private — enforced by membership-based RLS.

**Architecture:** New `course_members` + `course_share_links` tables. Three `SECURITY DEFINER` helpers (`is_course_member` / `is_course_contributor` / `is_course_owner`) gate RLS on `courses`, `course_materials`, `personal_files`, `content_embeddings`, and storage objects. A `join_course_via_link` RPC creates membership idempotently. A `course_moodle_view` helper exposes the owner's Moodle imports to members for both display and RAG. Members "Remove from my list" (leave) instead of deleting; owners delete the whole course. Personal notes (`documents`) are never shared and survive deletion (FK → `set null`).

**Tech Stack:** Next.js 16 (App Router, Server Actions), React 19, Supabase (Postgres + RLS + Storage), pgvector, TypeScript, Vitest (unit + `*.integration.test.ts` against local Supabase), Playwright (E2E), shadcn/ui, sonner.

**Spec:** `docs/superpowers/specs/2026-05-26-course-sharing-design.md`

**Conventions (read once):**

- One migration file for all schema: `supabase/migrations/20260526120000_course_sharing.sql`. Tasks 1–9 each append a labeled section to it. After editing the migration, apply with `pnpm supabase db reset` (re-applies all migrations + `seed.sql`). _If `pnpm supabase` is not wired, use `npx supabase db reset`._
- Integration tests end in `.integration.test.ts`, run with `pnpm test:integration`, use `src/test/supabase-client.ts` (`createAdminClient`, `createUserClient`, `TEST_USER_A`, `TEST_USER_B`). They talk to the **real local Supabase**.
- Unit tests end in `.test.ts(x)`, run with `pnpm test`, mock `@/lib/supabase/server`.
- Use **fixed UUIDs** for seeded test rows (e.g. `c0000000-0000-0000-0000-000000000001`) and clean them up in `afterEach`/`afterAll`.
- Commit after every task. Branch is already `feat/course-sharing`.

**Phases:**

- **Phase 1 — Database foundation** (Tasks 1–9): schema, helpers, RLS, RPCs. Independently testable via integration tests.
- **Phase 2 — Server actions** (Tasks 10–16): sharing, join, leave/remove, delete rewrite, open-action fix, RAG/Moodle owner-view, query scoping.
- **Phase 3 — UI** (Tasks 17–22): types, Share dialog, role-aware course page, file-item gating, dashboard "Shared with me", join route.
- **Phase 4 — E2E + registry** (Task 23).

---

## Phase 1 — Database foundation

### Task 1: Create migration with new tables

**Files:**

- Create: `supabase/migrations/20260526120000_course_sharing.sql`
- Test: `src/__tests__/integration/course-sharing-schema.integration.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/__tests__/integration/course-sharing-schema.integration.test.ts
import { describe, it, expect, afterEach, beforeAll } from 'vitest';
import {
  createAdminClient,
  TEST_USER_A,
  TEST_USER_B,
} from '@/test/supabase-client';

const admin = createAdminClient();
const COURSE = 'c0000000-0000-0000-0000-000000000001';

async function cleanup() {
  await admin.from('course_share_links').delete().eq('course_id', COURSE);
  await admin.from('course_members').delete().eq('course_id', COURSE);
  await admin.from('courses').delete().eq('id', COURSE);
}

describe('course sharing schema', () => {
  beforeAll(cleanup);
  afterEach(cleanup);

  it('course_members enforces unique(course_id, user_id) and role check', async () => {
    await admin
      .from('courses')
      .insert({ id: COURSE, user_id: TEST_USER_A.id, name: 'Shared' });

    const ok = await admin.from('course_members').insert({
      course_id: COURSE,
      user_id: TEST_USER_B.id,
      role: 'viewer',
    });
    expect(ok.error).toBeNull();

    const dup = await admin.from('course_members').insert({
      course_id: COURSE,
      user_id: TEST_USER_B.id,
      role: 'contributor',
    });
    expect(dup.error).not.toBeNull(); // unique violation

    const badRole = await admin.from('course_members').insert({
      course_id: COURSE,
      user_id: TEST_USER_A.id,
      role: 'admin',
    });
    expect(badRole.error).not.toBeNull(); // check violation
  });

  it('course_share_links allows one active link per role', async () => {
    await admin
      .from('courses')
      .insert({ id: COURSE, user_id: TEST_USER_A.id, name: 'Shared' });

    const a = await admin.from('course_share_links').insert({
      course_id: COURSE,
      token: 'tok-viewer-1',
      role: 'viewer',
    });
    expect(a.error).toBeNull();

    const b = await admin.from('course_share_links').insert({
      course_id: COURSE,
      token: 'tok-viewer-2',
      role: 'viewer',
    });
    expect(b.error).not.toBeNull(); // partial unique: one active viewer link
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test:integration -- course-sharing-schema`
Expected: FAIL — tables `course_members` / `course_share_links` do not exist.

- [ ] **Step 3: Create the migration file with tables**

```sql
-- supabase/migrations/20260526120000_course_sharing.sql
-- ============================================================
-- Course sharing: membership + share links, helper functions,
-- RLS, storage policies, join RPC, Moodle owner-view, embeddings.
-- ============================================================

-- 1. course_members ------------------------------------------
create table public.course_members (
  id         uuid primary key default gen_random_uuid(),
  course_id  uuid not null references public.courses(id)  on delete cascade,
  user_id    uuid not null references public.profiles(id) on delete cascade,
  role       text not null check (role in ('viewer', 'contributor')),
  created_at timestamptz not null default now(),
  unique (course_id, user_id)
);
create index course_members_user_idx   on public.course_members(user_id);
create index course_members_course_idx on public.course_members(course_id);

-- 2. course_share_links --------------------------------------
create table public.course_share_links (
  id         uuid primary key default gen_random_uuid(),
  course_id  uuid not null references public.courses(id) on delete cascade,
  token      text not null unique,
  role       text not null check (role in ('viewer', 'contributor')),
  is_active  boolean not null default true,
  created_at timestamptz not null default now()
);
create index course_share_links_course_idx on public.course_share_links(course_id);
create unique index course_share_links_active_role_idx
  on public.course_share_links(course_id, role)
  where is_active;
```

- [ ] **Step 4: Apply migration and run test**

Run: `pnpm supabase db reset && pnpm test:integration -- course-sharing-schema`
Expected: PASS (both tests).

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260526120000_course_sharing.sql src/__tests__/integration/course-sharing-schema.integration.test.ts
git commit -m "feat(sharing): add course_members + course_share_links tables"
```

---

### Task 2: Membership helper functions

**Files:**

- Modify: `supabase/migrations/20260526120000_course_sharing.sql` (append)
- Test: `src/__tests__/integration/course-sharing-helpers.integration.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/__tests__/integration/course-sharing-helpers.integration.test.ts
import { describe, it, expect, afterEach, beforeAll } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  createAdminClient,
  createUserClient,
  TEST_USER_A,
  TEST_USER_B,
} from '@/test/supabase-client';

const admin = createAdminClient();
const COURSE = 'c0000000-0000-0000-0000-000000000010';

async function cleanup() {
  await admin.from('course_members').delete().eq('course_id', COURSE);
  await admin.from('courses').delete().eq('id', COURSE);
}

describe('membership helper functions', () => {
  let clientB: SupabaseClient;

  beforeAll(async () => {
    clientB = await createUserClient(TEST_USER_B);
    await cleanup();
    // A owns the course; B is a viewer member.
    await admin
      .from('courses')
      .insert({ id: COURSE, user_id: TEST_USER_A.id, name: 'Shared' });
    await admin.from('course_members').insert({
      course_id: COURSE,
      user_id: TEST_USER_B.id,
      role: 'viewer',
    });
  });
  afterEach(async () => {});

  it('is_course_member: true for member B, owner included', async () => {
    const { data, error } = await clientB.rpc('is_course_member', {
      p_course_id: COURSE,
    });
    expect(error).toBeNull();
    expect(data).toBe(true);
  });

  it('is_course_contributor: false for viewer B', async () => {
    const { data } = await clientB.rpc('is_course_contributor', {
      p_course_id: COURSE,
    });
    expect(data).toBe(false);
  });

  it('is_course_owner: false for member B', async () => {
    const { data } = await clientB.rpc('is_course_owner', {
      p_course_id: COURSE,
    });
    expect(data).toBe(false);
  });
});

// NOTE: leaves COURSE seeded for reuse; final cleanup handled by the
// schema test's afterEach in a separate file. Add explicit cleanup here:
```

Add an `afterAll(cleanup)` to this file (replace the empty `afterEach`):

```ts
import { afterAll } from 'vitest';
// ...
afterAll(cleanup);
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test:integration -- course-sharing-helpers`
Expected: FAIL — function `is_course_member` does not exist.

- [ ] **Step 3: Append helper functions to the migration**

```sql
-- 3. Helper functions (SECURITY DEFINER — run as table owner, bypass RLS,
--    which prevents RLS recursion on course_members). -------------------
create or replace function public.is_course_member(p_course_id uuid)
returns boolean
language sql stable security definer set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.courses c
    where c.id = p_course_id and c.user_id = auth.uid()
  ) or exists (
    select 1 from public.course_members m
    where m.course_id = p_course_id and m.user_id = auth.uid()
  );
$$;

create or replace function public.is_course_contributor(p_course_id uuid)
returns boolean
language sql stable security definer set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.courses c
    where c.id = p_course_id and c.user_id = auth.uid()
  ) or exists (
    select 1 from public.course_members m
    where m.course_id = p_course_id and m.user_id = auth.uid()
      and m.role = 'contributor'
  );
$$;

create or replace function public.is_course_owner(p_course_id uuid)
returns boolean
language sql stable security definer set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.courses c
    where c.id = p_course_id and c.user_id = auth.uid()
  );
$$;

grant execute on function public.is_course_member(uuid)      to authenticated;
grant execute on function public.is_course_contributor(uuid) to authenticated;
grant execute on function public.is_course_owner(uuid)       to authenticated;
```

- [ ] **Step 4: Apply and run test**

Run: `pnpm supabase db reset && pnpm test:integration -- course-sharing-helpers`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260526120000_course_sharing.sql src/__tests__/integration/course-sharing-helpers.integration.test.ts
git commit -m "feat(sharing): add membership helper functions"
```

---

### Task 3: Change documents.course_id FK to ON DELETE SET NULL

**Files:**

- Modify: `supabase/migrations/20260526120000_course_sharing.sql` (append)
- Test: `src/__tests__/integration/course-sharing-doc-fk.integration.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/__tests__/integration/course-sharing-doc-fk.integration.test.ts
import { describe, it, expect, afterEach, beforeAll } from 'vitest';
import { createAdminClient, TEST_USER_B } from '@/test/supabase-client';

const admin = createAdminClient();
const COURSE = 'c0000000-0000-0000-0000-000000000020';
const DOC = 'd0000000-0000-0000-0000-000000000020';

async function cleanup() {
  await admin.from('documents').delete().eq('id', DOC);
  await admin.from('courses').delete().eq('id', COURSE);
}

describe('documents.course_id on delete set null', () => {
  beforeAll(cleanup);
  afterEach(cleanup);

  it('deleting a course nulls the doc course_id instead of deleting the doc', async () => {
    await admin
      .from('courses')
      .insert({ id: COURSE, user_id: TEST_USER_B.id, name: 'C' });
    await admin.from('documents').insert({
      id: DOC,
      user_id: TEST_USER_B.id,
      course_id: COURSE,
      title: 'Note',
      subject: 'other',
      canvas_type: 'blank',
      position: 0,
    });

    await admin.from('courses').delete().eq('id', COURSE);

    const { data } = await admin
      .from('documents')
      .select('id, course_id')
      .eq('id', DOC)
      .maybeSingle();
    expect(data).not.toBeNull(); // doc survives
    expect(data!.course_id).toBeNull(); // unfiled
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test:integration -- course-sharing-doc-fk`
Expected: FAIL — the doc is deleted (current FK is `on delete cascade`), so `data` is null.

- [ ] **Step 3: Append FK swap to the migration**

```sql
-- 4. documents.course_id: cascade -> set null (preserve notes on course delete)
alter table public.documents drop constraint documents_course_id_fkey;
alter table public.documents
  add constraint documents_course_id_fkey
  foreign key (course_id) references public.courses(id) on delete set null;
```

- [ ] **Step 4: Apply and run test**

Run: `pnpm supabase db reset && pnpm test:integration -- course-sharing-doc-fk`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260526120000_course_sharing.sql src/__tests__/integration/course-sharing-doc-fk.integration.test.ts
git commit -m "feat(sharing): preserve notes on course delete (course_id set null)"
```

---

### Task 4: RLS on courses, course_members, course_share_links

**Files:**

- Modify: `supabase/migrations/20260526120000_course_sharing.sql` (append)
- Test: `src/__tests__/integration/course-sharing-rls-courses.integration.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/__tests__/integration/course-sharing-rls-courses.integration.test.ts
import { describe, it, expect, afterAll, beforeAll } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  createAdminClient,
  createUserClient,
  TEST_USER_A,
  TEST_USER_B,
} from '@/test/supabase-client';

const admin = createAdminClient();
const SHARED = 'c0000000-0000-0000-0000-000000000030';
const PRIVATE = 'c0000000-0000-0000-0000-000000000031';

async function cleanup() {
  await admin
    .from('course_members')
    .delete()
    .in('course_id', [SHARED, PRIVATE]);
  await admin.from('courses').delete().in('id', [SHARED, PRIVATE]);
}

describe('RLS: courses + course_members visibility', () => {
  let clientB: SupabaseClient;
  beforeAll(async () => {
    clientB = await createUserClient(TEST_USER_B);
    await cleanup();
    await admin.from('courses').insert([
      { id: SHARED, user_id: TEST_USER_A.id, name: 'Shared by A' },
      { id: PRIVATE, user_id: TEST_USER_A.id, name: 'Private A' },
    ]);
    await admin.from('course_members').insert({
      course_id: SHARED,
      user_id: TEST_USER_B.id,
      role: 'viewer',
    });
  });
  afterAll(cleanup);

  it('member B can SELECT the shared course', async () => {
    const { data } = await clientB
      .from('courses')
      .select('id')
      .eq('id', SHARED);
    expect(data).toHaveLength(1);
  });

  it('non-member B cannot SELECT the private course', async () => {
    const { data } = await clientB
      .from('courses')
      .select('id')
      .eq('id', PRIVATE);
    expect(data ?? []).toHaveLength(0);
  });

  it('member B sees the roster of the shared course', async () => {
    const { data } = await clientB
      .from('course_members')
      .select('user_id, role')
      .eq('course_id', SHARED);
    expect((data ?? []).length).toBeGreaterThanOrEqual(1);
  });

  it('member B cannot update the shared course (owner-only)', async () => {
    await clientB.from('courses').update({ name: 'hacked' }).eq('id', SHARED);
    const { data } = await admin
      .from('courses')
      .select('name')
      .eq('id', SHARED)
      .single();
    expect(data!.name).toBe('Shared by A');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test:integration -- course-sharing-rls-courses`
Expected: FAIL — member B can't see the shared course yet (no member SELECT policy); roster query returns empty (RLS not enabled on course_members → actually denies).

- [ ] **Step 3: Append RLS policies to the migration**

```sql
-- 5. RLS: courses (add member read; owner policies from 00003 remain) -----
create policy "Members can view shared courses"
  on public.courses for select
  using (public.is_course_member(id));

-- 6. RLS: course_members ------------------------------------------------
alter table public.course_members enable row level security;

create policy "Members can view course roster"
  on public.course_members for select
  using (public.is_course_member(course_id));

create policy "Users can insert own membership"
  on public.course_members for insert
  with check (user_id = auth.uid());

create policy "Owner manages membership"
  on public.course_members for update
  using (public.is_course_owner(course_id));

create policy "Owner or self can remove membership"
  on public.course_members for delete
  using (public.is_course_owner(course_id) or user_id = auth.uid());

-- 7. RLS: course_share_links (owner-only manage) ------------------------
alter table public.course_share_links enable row level security;

create policy "Owner manages share links"
  on public.course_share_links for all
  using (public.is_course_owner(course_id))
  with check (public.is_course_owner(course_id));
```

- [ ] **Step 4: Apply and run test**

Run: `pnpm supabase db reset && pnpm test:integration -- course-sharing-rls-courses`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260526120000_course_sharing.sql src/__tests__/integration/course-sharing-rls-courses.integration.test.ts
git commit -m "feat(sharing): RLS for courses, members, and share links"
```

---

### Task 5: RLS on course_materials + personal_files

**Files:**

- Modify: `supabase/migrations/20260526120000_course_sharing.sql` (append)
- Test: `src/__tests__/integration/course-sharing-rls-materials.integration.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/__tests__/integration/course-sharing-rls-materials.integration.test.ts
import { describe, it, expect, afterAll, beforeAll } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  createAdminClient,
  createUserClient,
  TEST_USER_A,
  TEST_USER_B,
} from '@/test/supabase-client';

const admin = createAdminClient();
const COURSE = 'c0000000-0000-0000-0000-000000000040';
const PF_A = 'f0000000-0000-0000-0000-00000000004a'; // A's personal file

async function cleanup() {
  await admin.from('personal_files').delete().eq('course_id', COURSE);
  await admin.from('course_members').delete().eq('course_id', COURSE);
  await admin.from('courses').delete().eq('id', COURSE);
}

function pfRow(id: string, userId: string) {
  return {
    id,
    user_id: userId,
    course_id: COURSE,
    category: 'material',
    file_name: 'a.pdf',
    display_name: 'a',
    mime_type: 'application/pdf',
    file_size: 10,
    storage_path: `${userId}/${COURSE}/a.pdf`,
  };
}

describe('RLS: personal_files in shared course', () => {
  let viewer: SupabaseClient;
  let contributor: SupabaseClient;

  async function asViewer() {
    await admin.from('course_members').delete().eq('course_id', COURSE);
    await admin
      .from('course_members')
      .insert({ course_id: COURSE, user_id: TEST_USER_B.id, role: 'viewer' });
  }
  async function asContributor() {
    await admin.from('course_members').delete().eq('course_id', COURSE);
    await admin.from('course_members').insert({
      course_id: COURSE,
      user_id: TEST_USER_B.id,
      role: 'contributor',
    });
  }

  beforeAll(async () => {
    viewer = await createUserClient(TEST_USER_B);
    contributor = viewer; // same user, role toggled via membership row
    await cleanup();
    await admin
      .from('courses')
      .insert({ id: COURSE, user_id: TEST_USER_A.id, name: 'Shared' });
    await admin.from('personal_files').insert(pfRow(PF_A, TEST_USER_A.id));
  });
  afterAll(cleanup);

  it('member can SELECT another member-owner file', async () => {
    await asViewer();
    const { data } = await viewer
      .from('personal_files')
      .select('id')
      .eq('id', PF_A);
    expect(data).toHaveLength(1);
  });

  it('viewer INSERT is denied', async () => {
    await asViewer();
    const { error } = await viewer
      .from('personal_files')
      .insert(pfRow('f0000000-0000-0000-0000-0000000000b1', TEST_USER_B.id));
    expect(error).not.toBeNull();
  });

  it('contributor INSERT (own user_id) is allowed', async () => {
    await asContributor();
    const id = 'f0000000-0000-0000-0000-0000000000b2';
    const { error } = await contributor
      .from('personal_files')
      .insert(pfRow(id, TEST_USER_B.id));
    expect(error).toBeNull();
    await admin.from('personal_files').delete().eq('id', id);
  });

  it('member cannot delete a file they did not upload; owner can', async () => {
    await asContributor();
    await contributor.from('personal_files').delete().eq('id', PF_A);
    const stillThere = await admin
      .from('personal_files')
      .select('id')
      .eq('id', PF_A);
    expect(stillThere.data).toHaveLength(1); // B couldn't delete A's file
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test:integration -- course-sharing-rls-materials`
Expected: FAIL — member B can't SELECT A's file (no member policy); viewer INSERT currently _succeeds_ (old permissive policy) so that assertion fails too.

- [ ] **Step 3: Append RLS policies to the migration**

```sql
-- 8. RLS: course_materials — tighten INSERT, add member SELECT ----------
drop policy "Users can view own course materials"   on public.course_materials;
drop policy "Users can create own course materials" on public.course_materials;
drop policy "Users can update own course materials" on public.course_materials;
drop policy "Users can delete own course materials" on public.course_materials;

create policy "Members can view course materials"
  on public.course_materials for select
  using (public.is_course_member(course_id));
create policy "Contributors can add course materials"
  on public.course_materials for insert
  with check (auth.uid() = user_id and public.is_course_contributor(course_id));
create policy "Owner or uploader can update course materials"
  on public.course_materials for update
  using (auth.uid() = user_id or public.is_course_owner(course_id));
create policy "Owner or uploader can delete course materials"
  on public.course_materials for delete
  using (auth.uid() = user_id or public.is_course_owner(course_id));

-- 9. RLS: personal_files — same treatment -------------------------------
drop policy "Users can view own personal files"   on public.personal_files;
drop policy "Users can create own personal files" on public.personal_files;
drop policy "Users can update own personal files" on public.personal_files;
drop policy "Users can delete own personal files" on public.personal_files;

create policy "Members can view personal files"
  on public.personal_files for select
  using (public.is_course_member(course_id));
create policy "Contributors can add personal files"
  on public.personal_files for insert
  with check (auth.uid() = user_id and public.is_course_contributor(course_id));
create policy "Owner or uploader can update personal files"
  on public.personal_files for update
  using (auth.uid() = user_id or public.is_course_owner(course_id));
create policy "Owner or uploader can delete personal files"
  on public.personal_files for delete
  using (auth.uid() = user_id or public.is_course_owner(course_id));
```

- [ ] **Step 4: Apply and run test**

Run: `pnpm supabase db reset && pnpm test:integration -- course-sharing-rls-materials`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260526120000_course_sharing.sql src/__tests__/integration/course-sharing-rls-materials.integration.test.ts
git commit -m "feat(sharing): membership RLS on course_materials + personal_files"
```

---

### Task 6: Embeddings member-read + match_embeddings rewrite

**Files:**

- Modify: `supabase/migrations/20260526120000_course_sharing.sql` (append)
- Test: `src/__tests__/integration/course-sharing-embeddings.integration.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/__tests__/integration/course-sharing-embeddings.integration.test.ts
import { describe, it, expect, afterAll, beforeAll } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  createAdminClient,
  createUserClient,
  TEST_USER_A,
  TEST_USER_B,
} from '@/test/supabase-client';

const admin = createAdminClient();
const COURSE = 'c0000000-0000-0000-0000-000000000050';
const SRC = 'f0000000-0000-0000-0000-000000000050'; // A's personal_file id

// 1536-dim zero vector with a single 1 so cosine distance is well-defined.
const vec = Array.from({ length: 1536 }, (_, i) => (i === 0 ? 1 : 0));

async function cleanup() {
  await admin.from('content_embeddings').delete().eq('source_id', SRC);
  await admin.from('course_members').delete().eq('course_id', COURSE);
  await admin.from('courses').delete().eq('id', COURSE);
}

describe('shared embeddings + match_embeddings for members', () => {
  let clientB: SupabaseClient;
  beforeAll(async () => {
    clientB = await createUserClient(TEST_USER_B);
    await cleanup();
    await admin
      .from('courses')
      .insert({ id: COURSE, user_id: TEST_USER_A.id, name: 'Shared' });
    await admin.from('course_members').insert({
      course_id: COURSE,
      user_id: TEST_USER_B.id,
      role: 'viewer',
    });
    await admin.from('content_embeddings').insert({
      source_type: 'personal_file',
      source_id: SRC,
      segment_index: 0,
      segment_text: 'shared lecture content',
      embedding: JSON.stringify(vec),
      user_id: TEST_USER_A.id, // uploaded by A
      course_id: COURSE,
      source_name: 'lecture.pdf',
      mime_type: 'application/pdf',
    });
  });
  afterAll(cleanup);

  it('member B can SELECT A-owned embeddings for a shared course', async () => {
    const { data } = await clientB
      .from('content_embeddings')
      .select('id')
      .eq('source_id', SRC);
    expect(data).toHaveLength(1);
  });

  it('match_embeddings returns A-owned shared rows to member B', async () => {
    const { data, error } = await clientB.rpc('match_embeddings', {
      query_embedding: JSON.stringify(vec),
      match_user_id: TEST_USER_B.id,
      match_course_id: COURSE,
      match_count: 8,
      similarity_threshold: 0.1,
    });
    expect(error).toBeNull();
    expect(
      (data ?? []).some((r: { source_id: string }) => r.source_id === SRC),
    ).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test:integration -- course-sharing-embeddings`
Expected: FAIL — member B can't read A's embeddings (RLS), and `match_embeddings` filters `ce.user_id = match_user_id`.

- [ ] **Step 3: Append embeddings policy + RPC rewrite**

```sql
-- 10. content_embeddings: members read shared course/personal-file rows --
create policy "Members can read shared course embeddings"
  on public.content_embeddings for select
  using (
    source_type in ('course_material', 'personal_file')
    and public.is_course_member(course_id)
  );

-- 11. match_embeddings: scope by course_id / moodle whitelist (RLS gates
--     visibility). Removes all three ce.user_id filters. Signature
--     identical to the post-flatten version (20260525120000).
drop function if exists public.match_embeddings(
  extensions.vector, uuid, uuid, uuid, uuid[], integer, double precision
);
create or replace function public.match_embeddings(
  query_embedding extensions.vector(1536),
  match_user_id uuid,
  match_course_id uuid default null,
  match_moodle_course_id uuid default null,
  match_imported_moodle_file_ids uuid[] default null,
  match_count int default 8,
  similarity_threshold float default 0.3
)
returns table (
  id bigint, source_type text, source_id uuid, source_name text,
  segment_text text, page_start integer, page_end integer, course_id uuid,
  mime_type text, similarity float
)
language sql stable
as $$
  select
    ce.id, ce.source_type, ce.source_id, ce.source_name, ce.segment_text,
    ce.page_start, ce.page_end, ce.course_id, ce.mime_type,
    1 - (ce.embedding <=> query_embedding) as similarity
  from public.content_embeddings ce
  where (
      (ce.source_type in ('course_material', 'personal_file')
        and match_course_id is not null
        and ce.course_id = match_course_id)
      or
      (ce.source_type = 'moodle_file'
        and match_moodle_course_id is not null
        and ce.course_id = match_moodle_course_id
        and (match_imported_moodle_file_ids is null
             or ce.source_id = any(match_imported_moodle_file_ids)))
    )
    and 1 - (ce.embedding <=> query_embedding) > similarity_threshold
  order by ce.embedding <=> query_embedding
  limit match_count;
$$;
```

- [ ] **Step 4: Apply and run test**

Run: `pnpm supabase db reset && pnpm test:integration -- course-sharing-embeddings`
Expected: PASS (2 tests).

- [ ] **Step 5: Run the existing embeddings/RAG unit tests to confirm no regression**

Run: `pnpm test -- ai-context`
Expected: PASS (existing tests still green; signature unchanged).

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/20260526120000_course_sharing.sql src/__tests__/integration/course-sharing-embeddings.integration.test.ts
git commit -m "feat(sharing): members' RAG searches shared file embeddings"
```

---

### Task 7: join_course_via_link RPC

**Files:**

- Modify: `supabase/migrations/20260526120000_course_sharing.sql` (append)
- Test: `src/__tests__/integration/course-sharing-join.integration.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/__tests__/integration/course-sharing-join.integration.test.ts
import { describe, it, expect, afterAll, beforeAll } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  createAdminClient,
  createUserClient,
  TEST_USER_A,
  TEST_USER_B,
} from '@/test/supabase-client';

const admin = createAdminClient();
const COURSE = 'c0000000-0000-0000-0000-000000000060';
const TOKEN_ACTIVE = 'join-tok-active-60';
const TOKEN_OFF = 'join-tok-inactive-60';

async function cleanup() {
  await admin.from('course_members').delete().eq('course_id', COURSE);
  await admin.from('course_share_links').delete().eq('course_id', COURSE);
  await admin.from('courses').delete().eq('id', COURSE);
}

describe('join_course_via_link', () => {
  let clientA: SupabaseClient; // owner
  let clientB: SupabaseClient; // joiner
  beforeAll(async () => {
    clientA = await createUserClient(TEST_USER_A);
    clientB = await createUserClient(TEST_USER_B);
    await cleanup();
    await admin
      .from('courses')
      .insert({ id: COURSE, user_id: TEST_USER_A.id, name: 'Shared' });
    await admin.from('course_share_links').insert([
      { course_id: COURSE, token: TOKEN_ACTIVE, role: 'contributor' },
      { course_id: COURSE, token: TOKEN_OFF, role: 'viewer', is_active: false },
    ]);
  });
  afterAll(cleanup);

  it('B joins via active token as contributor', async () => {
    const { data, error } = await clientB.rpc('join_course_via_link', {
      p_token: TOKEN_ACTIVE,
    });
    expect(error).toBeNull();
    expect(data).toBe(COURSE);
    const { data: m } = await admin
      .from('course_members')
      .select('role')
      .eq('course_id', COURSE)
      .eq('user_id', TEST_USER_B.id)
      .single();
    expect(m!.role).toBe('contributor');
  });

  it('re-join is idempotent (no error, role unchanged)', async () => {
    const { error } = await clientB.rpc('join_course_via_link', {
      p_token: TOKEN_ACTIVE,
    });
    expect(error).toBeNull();
    const { count } = await admin
      .from('course_members')
      .select('id', { count: 'exact', head: true })
      .eq('course_id', COURSE)
      .eq('user_id', TEST_USER_B.id);
    expect(count).toBe(1);
  });

  it('owner self-join is a no-op returning the course id', async () => {
    const { data, error } = await clientA.rpc('join_course_via_link', {
      p_token: TOKEN_ACTIVE,
    });
    expect(error).toBeNull();
    expect(data).toBe(COURSE);
    const { count } = await admin
      .from('course_members')
      .select('id', { count: 'exact', head: true })
      .eq('course_id', COURSE)
      .eq('user_id', TEST_USER_A.id);
    expect(count).toBe(0); // owner never added as member
  });

  it('inactive token raises', async () => {
    const { error } = await clientB.rpc('join_course_via_link', {
      p_token: TOKEN_OFF,
    });
    expect(error).not.toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test:integration -- course-sharing-join`
Expected: FAIL — function `join_course_via_link` does not exist.

- [ ] **Step 3: Append the RPC**

```sql
-- 12. join_course_via_link: validate token, create membership idempotently
create or replace function public.join_course_via_link(p_token text)
returns uuid
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  v_course_id uuid;
  v_role text;
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'unauthenticated';
  end if;
  select course_id, role into v_course_id, v_role
    from public.course_share_links
    where token = p_token and is_active
    limit 1;
  if v_course_id is null then
    raise exception 'invalid_or_inactive_link';
  end if;
  if exists (
    select 1 from public.courses
    where id = v_course_id and user_id = v_uid
  ) then
    return v_course_id; -- owner already has access
  end if;
  insert into public.course_members (course_id, user_id, role)
    values (v_course_id, v_uid, v_role)
    on conflict (course_id, user_id) do nothing;
  return v_course_id;
end;
$$;

grant execute on function public.join_course_via_link(text) to authenticated;
```

- [ ] **Step 4: Apply and run test**

Run: `pnpm supabase db reset && pnpm test:integration -- course-sharing-join`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260526120000_course_sharing.sql src/__tests__/integration/course-sharing-join.integration.test.ts
git commit -m "feat(sharing): join_course_via_link RPC"
```

---

### Task 8: course_moodle_view helper (owner's Moodle imports for members)

**Files:**

- Modify: `supabase/migrations/20260526120000_course_sharing.sql` (append)
- Test: `src/__tests__/integration/course-sharing-moodle-view.integration.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/__tests__/integration/course-sharing-moodle-view.integration.test.ts
import { describe, it, expect, afterAll, beforeAll } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  createAdminClient,
  createUserClient,
  TEST_USER_A,
  TEST_USER_B,
} from '@/test/supabase-client';

const admin = createAdminClient();
const COURSE = 'c0000000-0000-0000-0000-000000000070';
const INSTANCE = 'e0000000-0000-0000-0000-000000000070';
const MCOURSE = 'a0000000-0000-0000-0000-000000000070';
const SECTION = 'b0000000-0000-0000-0000-000000000070';
const MFILE = '90000000-0000-0000-0000-000000000070';
const SYNC = '80000000-0000-0000-0000-000000000070';

async function cleanup() {
  await admin.from('user_file_imports').delete().eq('moodle_file_id', MFILE);
  await admin.from('user_course_syncs').delete().eq('id', SYNC);
  await admin.from('course_members').delete().eq('course_id', COURSE);
  await admin.from('courses').delete().eq('id', COURSE);
  await admin.from('moodle_files').delete().eq('id', MFILE);
  await admin.from('moodle_sections').delete().eq('id', SECTION);
  await admin.from('moodle_courses').delete().eq('id', MCOURSE);
  await admin.from('moodle_instances').delete().eq('id', INSTANCE);
}

describe('course_moodle_view', () => {
  let clientB: SupabaseClient;
  beforeAll(async () => {
    clientB = await createUserClient(TEST_USER_B);
    await cleanup();
    await admin
      .from('moodle_instances')
      .insert({ id: INSTANCE, domain: 'm70.example.edu', name: 'M70' });
    await admin.from('moodle_courses').insert({
      id: MCOURSE,
      instance_id: INSTANCE,
      moodle_course_id: '70',
      name: 'M Course',
    });
    await admin.from('moodle_sections').insert({
      id: SECTION,
      course_id: MCOURSE,
      moodle_section_id: '1',
      title: 'S1',
      position: 0,
    });
    await admin.from('moodle_files').insert({
      id: MFILE,
      section_id: SECTION,
      type: 'file',
      moodle_url: 'https://m70/file',
      file_name: 'm.pdf',
      content_hash: 'h70',
      position: 0,
    });
    await admin
      .from('courses')
      .insert({ id: COURSE, user_id: TEST_USER_A.id, name: 'Shared' });
    await admin.from('course_members').insert({
      course_id: COURSE,
      user_id: TEST_USER_B.id,
      role: 'viewer',
    });
    // Owner A's sync + import
    await admin.from('user_course_syncs').insert({
      id: SYNC,
      user_id: TEST_USER_A.id,
      moodle_course_id: MCOURSE,
      course_id: COURSE,
    });
    await admin.from('user_file_imports').insert({
      user_id: TEST_USER_A.id,
      moodle_file_id: MFILE,
      sync_id: SYNC,
      status: 'imported',
    });
  });
  afterAll(cleanup);

  it('returns owner moodle_course_id + imported ids to member B', async () => {
    const { data, error } = await clientB.rpc('course_moodle_view', {
      p_course_id: COURSE,
    });
    expect(error).toBeNull();
    // Function returns a single row: { moodle_course_id, imported_file_ids }
    const row = Array.isArray(data) ? data[0] : data;
    expect(row.moodle_course_id).toBe(MCOURSE);
    expect(row.imported_file_ids).toContain(MFILE);
  });

  it('returns null view to a non-member', async () => {
    await admin.from('course_members').delete().eq('course_id', COURSE);
    const { data } = await clientB.rpc('course_moodle_view', {
      p_course_id: COURSE,
    });
    const row = Array.isArray(data) ? data[0] : data;
    expect(row?.moodle_course_id ?? null).toBeNull();
    // restore membership for any later runs
    await admin.from('course_members').insert({
      course_id: COURSE,
      user_id: TEST_USER_B.id,
      role: 'viewer',
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test:integration -- course-sharing-moodle-view`
Expected: FAIL — function `course_moodle_view` does not exist.

- [ ] **Step 3: Append the helper**

```sql
-- 13. course_moodle_view: the OWNER's moodle sync + imported file ids for a
--     shared course, exposed to any member (gated by is_course_member).
create or replace function public.course_moodle_view(p_course_id uuid)
returns table (moodle_course_id uuid, imported_file_ids uuid[])
language plpgsql stable security definer set search_path = public, pg_temp
as $$
declare
  v_owner uuid;
  v_mcourse uuid;
begin
  if not public.is_course_member(p_course_id) then
    return query select null::uuid, null::uuid[];
    return;
  end if;
  select user_id into v_owner from public.courses where id = p_course_id;
  select s.moodle_course_id into v_mcourse
    from public.user_course_syncs s
    where s.course_id = p_course_id and s.user_id = v_owner
    limit 1;
  if v_mcourse is null then
    return query select null::uuid, null::uuid[];
    return;
  end if;
  return query
    select
      v_mcourse,
      coalesce(array_agg(fi.moodle_file_id), array[]::uuid[])
    from public.user_file_imports fi
    where fi.user_id = v_owner
      and fi.status = 'imported'
      and fi.moodle_file_id in (
        select mf.id from public.moodle_files mf
        join public.moodle_sections ms on ms.id = mf.section_id
        where ms.course_id = v_mcourse
      );
end;
$$;

grant execute on function public.course_moodle_view(uuid) to authenticated;
```

- [ ] **Step 4: Apply and run test**

Run: `pnpm supabase db reset && pnpm test:integration -- course-sharing-moodle-view`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260526120000_course_sharing.sql src/__tests__/integration/course-sharing-moodle-view.integration.test.ts
git commit -m "feat(sharing): course_moodle_view exposes owner's Moodle imports to members"
```

---

### Task 9: Storage RLS for member reads

**Files:**

- Modify: `supabase/migrations/20260526120000_course_sharing.sql` (append)
- Test: `src/__tests__/integration/course-sharing-storage.integration.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/__tests__/integration/course-sharing-storage.integration.test.ts
import { describe, it, expect, afterAll, beforeAll } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  createAdminClient,
  createUserClient,
  TEST_USER_A,
  TEST_USER_B,
} from '@/test/supabase-client';

const admin = createAdminClient();
const COURSE = 'c0000000-0000-0000-0000-000000000080';
const PF = 'f0000000-0000-0000-0000-000000000080';
const PATH = `${TEST_USER_A.id}/${COURSE}/shared.pdf`;

async function cleanup() {
  await admin.storage.from('personal-files').remove([PATH]);
  await admin.from('personal_files').delete().eq('id', PF);
  await admin.from('course_members').delete().eq('course_id', COURSE);
  await admin.from('courses').delete().eq('id', COURSE);
}

describe('storage RLS: members can read shared files', () => {
  let clientB: SupabaseClient;
  beforeAll(async () => {
    clientB = await createUserClient(TEST_USER_B);
    await cleanup();
    await admin
      .from('courses')
      .insert({ id: COURSE, user_id: TEST_USER_A.id, name: 'Shared' });
    await admin.from('course_members').insert({
      course_id: COURSE,
      user_id: TEST_USER_B.id,
      role: 'viewer',
    });
    await admin.storage
      .from('personal-files')
      .upload(PATH, new Blob(['%PDF-1.4 test']), {
        contentType: 'application/pdf',
        upsert: true,
      });
    await admin.from('personal_files').insert({
      id: PF,
      user_id: TEST_USER_A.id,
      course_id: COURSE,
      category: 'material',
      file_name: 'shared.pdf',
      display_name: 'shared',
      mime_type: 'application/pdf',
      file_size: 13,
      storage_path: PATH,
    });
  });
  afterAll(cleanup);

  it('member B can create a signed URL for A-owned shared file', async () => {
    const { data, error } = await clientB.storage
      .from('personal-files')
      .createSignedUrl(PATH, 3600);
    expect(error).toBeNull();
    expect(data?.signedUrl).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test:integration -- course-sharing-storage`
Expected: FAIL — B can't sign a URL for A's object (per-user storage RLS denies).

- [ ] **Step 3: Append storage policies**

```sql
-- 14. Storage: members can read objects backing shared materials --------
create policy "Members can read shared course materials"
  on storage.objects for select
  using (
    bucket_id = 'course-materials'
    and exists (
      select 1 from public.course_materials cm
      where cm.storage_path = name
        and public.is_course_member(cm.course_id)
    )
  );

create policy "Members can read shared personal files"
  on storage.objects for select
  using (
    bucket_id = 'personal-files'
    and exists (
      select 1 from public.personal_files pf
      where pf.storage_path = name
        and public.is_course_member(pf.course_id)
    )
  );
```

- [ ] **Step 4: Apply and run test**

Run: `pnpm supabase db reset && pnpm test:integration -- course-sharing-storage`
Expected: PASS.

- [ ] **Step 5: Run the full integration suite to confirm Phase 1 is green together**

Run: `pnpm test:integration`
Expected: PASS (all course-sharing integration files + existing ones).

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/20260526120000_course_sharing.sql src/__tests__/integration/course-sharing-storage.integration.test.ts
git commit -m "feat(sharing): storage RLS for member reads"
```

---

## Phase 2 — Server actions

### Task 10: Sharing management actions

**Files:**

- Create: `src/lib/actions/course-sharing.ts`
- Test: `src/lib/actions/__tests__/course-sharing.integration.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/actions/__tests__/course-sharing.integration.test.ts
import { describe, it, expect, afterAll, beforeAll, vi } from 'vitest';
import {
  createAdminClient,
  TEST_USER_A,
  TEST_USER_B,
} from '@/test/supabase-client';

// Make the server-action createClient run as owner A (anon key + A's JWT).
vi.mock('@/lib/supabase/server', async () => {
  const { createUserClient, TEST_USER_A } =
    await import('@/test/supabase-client');
  return { createClient: async () => createUserClient(TEST_USER_A) };
});
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));

const admin = createAdminClient();
const COURSE = 'c0000000-0000-0000-0000-000000000100';

async function cleanup() {
  await admin.from('course_members').delete().eq('course_id', COURSE);
  await admin.from('course_share_links').delete().eq('course_id', COURSE);
  await admin.from('courses').delete().eq('id', COURSE);
}

describe('course-sharing actions (as owner A)', () => {
  beforeAll(async () => {
    await cleanup();
    await admin
      .from('courses')
      .insert({ id: COURSE, user_id: TEST_USER_A.id, name: 'Shared' });
  });
  afterAll(cleanup);

  it('createOrUpdateShareLink creates an active viewer link', async () => {
    const { createOrUpdateShareLink } = await import('../course-sharing');
    const { token } = await createOrUpdateShareLink({
      courseId: COURSE,
      role: 'viewer',
    });
    expect(token).toMatch(/.{16,}/);
    const { data } = await admin
      .from('course_share_links')
      .select('role, is_active')
      .eq('course_id', COURSE)
      .eq('token', token)
      .single();
    expect(data).toEqual({ role: 'viewer', is_active: true });
  });

  it('regenerateShareLink deactivates the old token and returns a new one', async () => {
    const { createOrUpdateShareLink, regenerateShareLink } =
      await import('../course-sharing');
    const first = await createOrUpdateShareLink({
      courseId: COURSE,
      role: 'contributor',
    });
    const second = await regenerateShareLink({
      courseId: COURSE,
      role: 'contributor',
    });
    expect(second.token).not.toBe(first.token);
    const { data: old } = await admin
      .from('course_share_links')
      .select('is_active')
      .eq('token', first.token)
      .single();
    expect(old!.is_active).toBe(false);
  });

  it('listMembers returns the roster with roles', async () => {
    await admin.from('course_members').insert({
      course_id: COURSE,
      user_id: TEST_USER_B.id,
      role: 'viewer',
    });
    const { listMembers } = await import('../course-sharing');
    const members = await listMembers(COURSE);
    expect(members.some((m) => m.user_id === TEST_USER_B.id)).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test:integration -- course-sharing.integration`
Expected: FAIL — module `../course-sharing` does not exist.

- [ ] **Step 3: Create the actions file**

```ts
// src/lib/actions/course-sharing.ts
'use server';

import { randomBytes } from 'crypto';
import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';

export type ShareRole = 'viewer' | 'contributor';

export interface MemberRow {
  user_id: string;
  role: ShareRole;
  display_name: string | null;
  email: string | null;
}

function newToken(): string {
  // URL-safe ~22 chars
  return randomBytes(16).toString('base64url');
}

async function authed() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');
  return { supabase, user };
}

export async function createOrUpdateShareLink(input: {
  courseId: string;
  role: ShareRole;
}): Promise<{ token: string }> {
  const { supabase } = await authed();
  // Reuse an existing active link for this role if present.
  const { data: existing } = await supabase
    .from('course_share_links')
    .select('token')
    .eq('course_id', input.courseId)
    .eq('role', input.role)
    .eq('is_active', true)
    .maybeSingle();
  if (existing?.token) return { token: existing.token };

  const token = newToken();
  const { error } = await supabase.from('course_share_links').insert({
    course_id: input.courseId,
    role: input.role,
    token,
  });
  if (error) throw new Error(error.message);
  revalidatePath('/dashboard/courses/' + input.courseId);
  return { token };
}

export async function deactivateShareLink(input: {
  courseId: string;
  role: ShareRole;
}): Promise<void> {
  const { supabase } = await authed();
  const { error } = await supabase
    .from('course_share_links')
    .update({ is_active: false })
    .eq('course_id', input.courseId)
    .eq('role', input.role)
    .eq('is_active', true);
  if (error) throw new Error(error.message);
  revalidatePath('/dashboard/courses/' + input.courseId);
}

export async function regenerateShareLink(input: {
  courseId: string;
  role: ShareRole;
}): Promise<{ token: string }> {
  await deactivateShareLink(input);
  return createOrUpdateShareLink(input);
}

export async function listMembers(courseId: string): Promise<MemberRow[]> {
  const { supabase } = await authed();
  const { data, error } = await supabase
    .from('course_members')
    .select('user_id, role, profiles(display_name, email)')
    .eq('course_id', courseId);
  if (error) throw new Error(error.message);
  return (data ?? []).map((r) => {
    const profile = r.profiles as
      | { display_name: string | null; email: string | null }
      | { display_name: string | null; email: string | null }[]
      | null;
    const p = Array.isArray(profile) ? profile[0] : profile;
    return {
      user_id: r.user_id as string,
      role: r.role as ShareRole,
      display_name: p?.display_name ?? null,
      email: p?.email ?? null,
    };
  });
}

export async function updateMemberRole(input: {
  courseId: string;
  userId: string;
  role: ShareRole;
}): Promise<void> {
  const { supabase } = await authed();
  const { error } = await supabase
    .from('course_members')
    .update({ role: input.role })
    .eq('course_id', input.courseId)
    .eq('user_id', input.userId);
  if (error) throw new Error(error.message);
  revalidatePath('/dashboard/courses/' + input.courseId);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test:integration -- course-sharing.integration`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/actions/course-sharing.ts src/lib/actions/__tests__/course-sharing.integration.test.ts
git commit -m "feat(sharing): share-link + member management actions"
```

---

### Task 11: removeMembership (leave + owner-remove)

**Files:**

- Modify: `src/lib/actions/course-sharing.ts` (append `leaveCourse`, `removeMember`, internal `removeMembership`)
- Test: `src/lib/actions/__tests__/course-sharing-leave.integration.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/actions/__tests__/course-sharing-leave.integration.test.ts
import { describe, it, expect, afterAll, beforeAll, vi } from 'vitest';
import {
  createAdminClient,
  TEST_USER_A,
  TEST_USER_B,
} from '@/test/supabase-client';

// Run server actions as member B.
vi.mock('@/lib/supabase/server', async () => {
  const { createUserClient, TEST_USER_B } =
    await import('@/test/supabase-client');
  return { createClient: async () => createUserClient(TEST_USER_B) };
});
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));

const admin = createAdminClient();
const COURSE = 'c0000000-0000-0000-0000-000000000110';
const PF_B = 'f0000000-0000-0000-0000-00000000011b';
const NOTE_B = 'd0000000-0000-0000-0000-00000000011b';

async function cleanup() {
  await admin.from('personal_files').delete().eq('course_id', COURSE);
  await admin.from('documents').delete().eq('id', NOTE_B);
  await admin.from('course_members').delete().eq('course_id', COURSE);
  await admin.from('courses').delete().eq('id', COURSE);
}

describe('leaveCourse (member B)', () => {
  beforeAll(async () => {
    await cleanup();
    await admin
      .from('courses')
      .insert({ id: COURSE, user_id: TEST_USER_A.id, name: 'Shared' });
    await admin.from('course_members').insert({
      course_id: COURSE,
      user_id: TEST_USER_B.id,
      role: 'contributor',
    });
    // B's contributed file + B's private note in the shared course
    await admin.from('personal_files').insert({
      id: PF_B,
      user_id: TEST_USER_B.id,
      course_id: COURSE,
      category: 'material',
      file_name: 'b.pdf',
      display_name: 'b',
      mime_type: 'application/pdf',
      file_size: 10,
      storage_path: `${TEST_USER_B.id}/${COURSE}/b.pdf`,
    });
    await admin.from('documents').insert({
      id: NOTE_B,
      user_id: TEST_USER_B.id,
      course_id: COURSE,
      title: 'B note',
      subject: 'other',
      canvas_type: 'blank',
      position: 0,
    });
  });
  afterAll(cleanup);

  it('deletes B contributed files, unfiles B notes, drops membership; course intact', async () => {
    const { leaveCourse } = await import('../course-sharing');
    await leaveCourse(COURSE);

    const { data: file } = await admin
      .from('personal_files')
      .select('id')
      .eq('id', PF_B);
    expect(file ?? []).toHaveLength(0); // file removed

    const { data: note } = await admin
      .from('documents')
      .select('course_id')
      .eq('id', NOTE_B)
      .single();
    expect(note!.course_id).toBeNull(); // note kept, unfiled

    const { data: mem } = await admin
      .from('course_members')
      .select('id')
      .eq('course_id', COURSE)
      .eq('user_id', TEST_USER_B.id);
    expect(mem ?? []).toHaveLength(0); // membership gone

    const { data: course } = await admin
      .from('courses')
      .select('id')
      .eq('id', COURSE);
    expect(course).toHaveLength(1); // course persists for owner
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test:integration -- course-sharing-leave`
Expected: FAIL — `leaveCourse` is not exported.

- [ ] **Step 3: Append removeMembership + leaveCourse + removeMember**

```ts
// Append to src/lib/actions/course-sharing.ts
import { createAdminClient } from '@/lib/supabase/admin';
import { deleteEmbeddingsBySource } from '@/lib/queries/embeddings';

// Internal: remove a member's files + unfile their notes + drop membership.
// Uses the admin client so an owner can act on another user's rows.
async function removeMembership(courseId: string, targetUserId: string) {
  const admin = createAdminClient();

  const [{ data: materials }, { data: files }] = await Promise.all([
    admin
      .from('course_materials')
      .select('id, storage_path')
      .eq('course_id', courseId)
      .eq('user_id', targetUserId),
    admin
      .from('personal_files')
      .select('id, storage_path')
      .eq('course_id', courseId)
      .eq('user_id', targetUserId),
  ]);

  for (const m of materials ?? [])
    await deleteEmbeddingsBySource('course_material', m.id);
  for (const f of files ?? [])
    await deleteEmbeddingsBySource('personal_file', f.id);

  const matPaths = (materials ?? []).map((m) => m.storage_path);
  const pfPaths = (files ?? []).map((f) => f.storage_path);
  if (matPaths.length)
    await admin.storage.from('course-materials').remove(matPaths);
  if (pfPaths.length)
    await admin.storage.from('personal-files').remove(pfPaths);

  await admin
    .from('course_materials')
    .delete()
    .eq('course_id', courseId)
    .eq('user_id', targetUserId);
  await admin
    .from('personal_files')
    .delete()
    .eq('course_id', courseId)
    .eq('user_id', targetUserId);

  // Keep the target's notes — just unfile them.
  await admin
    .from('documents')
    .update({ course_id: null })
    .eq('course_id', courseId)
    .eq('user_id', targetUserId);

  await admin
    .from('course_members')
    .delete()
    .eq('course_id', courseId)
    .eq('user_id', targetUserId);
}

// Member self-leave ("Remove from my list").
export async function leaveCourse(courseId: string): Promise<void> {
  const { user } = await authed();
  await removeMembership(courseId, user.id);
  revalidatePath('/dashboard');
}

// Owner removes a member.
export async function removeMember(input: {
  courseId: string;
  userId: string;
}): Promise<void> {
  const { supabase, user } = await authed();
  const { data: course } = await supabase
    .from('courses')
    .select('user_id')
    .eq('id', input.courseId)
    .single();
  if (!course || course.user_id !== user.id) {
    throw new Error('Only the course owner can remove members');
  }
  await removeMembership(input.courseId, input.userId);
  revalidatePath('/dashboard/courses/' + input.courseId);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test:integration -- course-sharing-leave`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/actions/course-sharing.ts src/lib/actions/__tests__/course-sharing-leave.integration.test.ts
git commit -m "feat(sharing): leaveCourse + removeMember (removeMembership routine)"
```

---

### Task 12: Join route + page

**Files:**

- Create: `src/app/(dashboard)/share/[token]/page.tsx`
- Test: `e2e` covers this in Task 23; add a thin unit test of the redirect target is not practical (server component + redirect). Verify manually in Step 4.

- [ ] **Step 1: Create the join page**

```tsx
// src/app/(dashboard)/share/[token]/page.tsx
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';

export default async function JoinSharePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect('/login?next=' + encodeURIComponent('/share/' + token));
  }

  const { data: courseId, error } = await supabase.rpc('join_course_via_link', {
    p_token: token,
  });

  if (error || !courseId) {
    return (
      <div className="mx-auto mt-24 max-w-md text-center">
        <h1 className="text-xl font-semibold">This link isn’t valid</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          The share link is inactive or no longer exists. Ask the course owner
          for a new link.
        </p>
        <a className="mt-4 inline-block underline" href="/dashboard">
          Back to dashboard
        </a>
      </div>
    );
  }

  redirect('/dashboard/courses/' + courseId);
}
```

- [ ] **Step 2: Verify the login `next` redirect is honored**

Read `src/app/(auth)/login` (or wherever login lives). Confirm it reads a `next` query param and redirects there after sign-in. If it does **not**, note it for Task 23's E2E (the test will navigate to the link while already logged in). Run:
`grep -rn "next" src/app/**/login*/**/*.tsx src/app/**/*login*/*.tsx 2>/dev/null`

- [ ] **Step 3: Manual smoke (optional, confirmed by E2E later)**

Run the dev server (`pnpm dev`), create a share link via the dialog (after Phase 3), open `/share/<token>` in a second browser profile signed in as `test-b@typenote.dev`, confirm redirect into the course.

- [ ] **Step 4: Commit**

```bash
git add "src/app/(dashboard)/share/[token]/page.tsx"
git commit -m "feat(sharing): /share/[token] join route"
```

---

### Task 13: Rewrite deleteCourse for shared courses

**Files:**

- Modify: `src/lib/actions/courses.ts` (`deleteCourse`)
- Test: `src/lib/actions/__tests__/course-delete-shared.integration.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/actions/__tests__/course-delete-shared.integration.test.ts
import { describe, it, expect, afterAll, beforeAll, vi } from 'vitest';
import {
  createAdminClient,
  TEST_USER_A,
  TEST_USER_B,
} from '@/test/supabase-client';

// Run deleteCourse as owner A.
vi.mock('@/lib/supabase/server', async () => {
  const { createUserClient, TEST_USER_A } =
    await import('@/test/supabase-client');
  return { createClient: async () => createUserClient(TEST_USER_A) };
});
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));

const admin = createAdminClient();
const COURSE = 'c0000000-0000-0000-0000-000000000130';
const PF_B = 'f0000000-0000-0000-0000-00000000013b';
const NOTE_B = 'd0000000-0000-0000-0000-00000000013b';

async function cleanup() {
  await admin.from('personal_files').delete().eq('course_id', COURSE);
  await admin.from('documents').delete().eq('id', NOTE_B);
  await admin.from('course_members').delete().eq('course_id', COURSE);
  await admin.from('courses').delete().eq('id', COURSE);
}

describe('deleteCourse on a shared course (owner A)', () => {
  beforeAll(async () => {
    await cleanup();
    await admin
      .from('courses')
      .insert({ id: COURSE, user_id: TEST_USER_A.id, name: 'Shared' });
    await admin.from('course_members').insert({
      course_id: COURSE,
      user_id: TEST_USER_B.id,
      role: 'contributor',
    });
    await admin.from('personal_files').insert({
      id: PF_B,
      user_id: TEST_USER_B.id,
      course_id: COURSE,
      category: 'material',
      file_name: 'b.pdf',
      display_name: 'b',
      mime_type: 'application/pdf',
      file_size: 10,
      storage_path: `${TEST_USER_B.id}/${COURSE}/b.pdf`,
    });
    await admin.from('documents').insert({
      id: NOTE_B,
      user_id: TEST_USER_B.id,
      course_id: COURSE,
      title: 'B note',
      subject: 'other',
      canvas_type: 'blank',
      position: 0,
    });
  });
  afterAll(cleanup);

  it("deletes contributors' files but preserves members' notes (unfiled)", async () => {
    const { deleteCourse } = await import('../courses');
    await deleteCourse(COURSE);

    const { data: file } = await admin
      .from('personal_files')
      .select('id')
      .eq('id', PF_B);
    expect(file ?? []).toHaveLength(0); // contributor's file gone

    const { data: note } = await admin
      .from('documents')
      .select('course_id')
      .eq('id', NOTE_B)
      .single();
    expect(note!.course_id).toBeNull(); // member's note survives, unfiled

    const { data: course } = await admin
      .from('courses')
      .select('id')
      .eq('id', COURSE);
    expect(course ?? []).toHaveLength(0); // course gone
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test:integration -- course-delete-shared`
Expected: FAIL — current `deleteCourse` only removes A's own materials and leaves B's `personal_files` (no `personal_files` handling), so the file still exists.

- [ ] **Step 3: Rewrite deleteCourse**

Replace the body of `deleteCourse` in `src/lib/actions/courses.ts` (keep the export signature `deleteCourse(id: string)`):

```ts
// src/lib/actions/courses.ts
import { createAdminClient } from '@/lib/supabase/admin';
// (keep existing imports: createClient, revalidatePath, deleteEmbeddingsBySource)

export async function deleteCourse(id: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');

  // Authorize: only the owner may delete.
  const { data: course } = await supabase
    .from('courses')
    .select('user_id')
    .eq('id', id)
    .single();
  if (!course || course.user_id !== user.id) {
    throw new Error('Only the course owner can delete this course');
  }

  // Use admin client: contributors' files/objects live under their own user
  // prefix, unreachable via the owner's per-user storage RLS.
  const admin = createAdminClient();

  const [{ data: materials }, { data: files }] = await Promise.all([
    admin
      .from('course_materials')
      .select('id, storage_path')
      .eq('course_id', id),
    admin.from('personal_files').select('id, storage_path').eq('course_id', id),
  ]);

  // Embeddings do not cascade (content_embeddings.course_id FK was dropped).
  for (const m of materials ?? [])
    await deleteEmbeddingsBySource('course_material', m.id);
  for (const f of files ?? [])
    await deleteEmbeddingsBySource('personal_file', f.id);

  const matPaths = (materials ?? []).map((m) => m.storage_path);
  const pfPaths = (files ?? []).map((f) => f.storage_path);
  if (matPaths.length)
    await admin.storage.from('course-materials').remove(matPaths);
  if (pfPaths.length)
    await admin.storage.from('personal-files').remove(pfPaths);

  // Delete the course row. DB cascades members, share links, materials,
  // personal_files, homework_sessions, ai_conversations; documents.course_id
  // is set null (members' notes survive as unfiled).
  const { error } = await admin.from('courses').delete().eq('id', id);
  if (error) throw new Error(error.message);

  revalidatePath('/dashboard');
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test:integration -- course-delete-shared`
Expected: PASS.

- [ ] **Step 5: Run existing courses tests for regression**

Run: `pnpm test:integration -- courses.integration && pnpm test -- courses`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/lib/actions/courses.ts src/lib/actions/__tests__/course-delete-shared.integration.test.ts
git commit -m "feat(sharing): deleteCourse cleans all members' files, keeps notes"
```

---

### Task 14: Open-as-document actions allow members

**Files:**

- Modify: `src/lib/actions/documents.ts` (`openMaterialAsDocument`)
- Modify: `src/lib/actions/personal-files.ts` (`openPersonalFileAsDocument`)
- Test: `src/lib/actions/__tests__/open-shared-file.integration.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/actions/__tests__/open-shared-file.integration.test.ts
import { describe, it, expect, afterAll, beforeAll, vi } from 'vitest';
import {
  createAdminClient,
  TEST_USER_A,
  TEST_USER_B,
} from '@/test/supabase-client';

// Run as member B.
vi.mock('@/lib/supabase/server', async () => {
  const { createUserClient, TEST_USER_B } =
    await import('@/test/supabase-client');
  return { createClient: async () => createUserClient(TEST_USER_B) };
});
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));

const admin = createAdminClient();
const COURSE = 'c0000000-0000-0000-0000-000000000140';
const PF_A = 'f0000000-0000-0000-0000-00000000014a';

async function cleanup() {
  await admin.from('documents').delete().eq('personal_file_id', PF_A);
  await admin.from('personal_files').delete().eq('id', PF_A);
  await admin.from('course_members').delete().eq('course_id', COURSE);
  await admin.from('courses').delete().eq('id', COURSE);
}

describe('openPersonalFileAsDocument as member', () => {
  beforeAll(async () => {
    await cleanup();
    await admin
      .from('courses')
      .insert({ id: COURSE, user_id: TEST_USER_A.id, name: 'Shared' });
    await admin.from('course_members').insert({
      course_id: COURSE,
      user_id: TEST_USER_B.id,
      role: 'viewer',
    });
    await admin.from('personal_files').insert({
      id: PF_A,
      user_id: TEST_USER_A.id, // uploaded by owner A
      course_id: COURSE,
      category: 'material',
      file_name: 'a.pdf',
      display_name: 'a',
      mime_type: 'application/pdf',
      file_size: 10,
      storage_path: `${TEST_USER_A.id}/${COURSE}/a.pdf`,
    });
  });
  afterAll(cleanup);

  it('member B can open A-owned shared file as their own document', async () => {
    const { openPersonalFileAsDocument } = await import('../personal-files');
    const { documentId, created } = await openPersonalFileAsDocument({
      fileId: PF_A,
    });
    expect(documentId).toBeTruthy();
    expect(created).toBe(true);
    const { data: doc } = await admin
      .from('documents')
      .select('user_id, personal_file_id')
      .eq('id', documentId)
      .single();
    expect(doc!.user_id).toBe(TEST_USER_B.id); // B's own doc
    expect(doc!.personal_file_id).toBe(PF_A);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test:integration -- open-shared-file`
Expected: FAIL — `openPersonalFileAsDocument` throws "Personal file not found" (`file.user_id !== user.id`).

- [ ] **Step 3: Replace the ownership checks with membership checks**

In `src/lib/actions/personal-files.ts`, replace line ~76:

```ts
// BEFORE: if (file.user_id !== user.id) throw new Error('Personal file not found');
// AFTER:
const { data: isMember } = await supabase.rpc('is_course_member', {
  p_course_id: file.course_id,
});
if (!isMember) throw new Error('Personal file not found');
```

In `src/lib/actions/documents.ts`, replace line ~208 in `openMaterialAsDocument`:

```ts
// BEFORE: if (material.user_id !== user.id) throw new Error('Material not found');
// AFTER:
const { data: isMember } = await supabase.rpc('is_course_member', {
  p_course_id: material.course_id,
});
if (!isMember) throw new Error('Material not found');
```

(Both functions already stamp the new `documents` row with `user_id: user.id`,
and the `(file_id, user_id)` unique indexes keep per-member docs independent.)

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test:integration -- open-shared-file`
Expected: PASS.

- [ ] **Step 5: Run existing unit tests for these actions**

Run: `pnpm test -- personal-files documents`
Expected: PASS (owner path unchanged — `is_course_member` is true for the owner).

- [ ] **Step 6: Commit**

```bash
git add src/lib/actions/personal-files.ts src/lib/actions/documents.ts src/lib/actions/__tests__/open-shared-file.integration.test.ts
git commit -m "feat(sharing): members can open shared files as their own documents"
```

---

### Task 15: searchContext + Moodle display use owner-view

**Files:**

- Modify: `src/lib/actions/ai-context.ts` (`searchContext` Moodle resolution)
- Modify: `src/lib/actions/moodle-materials.ts` (`getMoodleMaterialsForCourse`)
- Test: `src/lib/actions/__tests__/moodle-materials-shared.integration.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/actions/__tests__/moodle-materials-shared.integration.test.ts
import { describe, it, expect, afterAll, beforeAll, vi } from 'vitest';
import {
  createAdminClient,
  TEST_USER_A,
  TEST_USER_B,
} from '@/test/supabase-client';

// Run getMoodleMaterialsForCourse as member B (no own sync).
vi.mock('@/lib/supabase/server', async () => {
  const { createUserClient, TEST_USER_B } =
    await import('@/test/supabase-client');
  return { createClient: async () => createUserClient(TEST_USER_B) };
});

const admin = createAdminClient();
const COURSE = 'c0000000-0000-0000-0000-000000000150';
const INSTANCE = 'e0000000-0000-0000-0000-000000000150';
const MCOURSE = 'a0000000-0000-0000-0000-000000000150';
const SECTION = 'b0000000-0000-0000-0000-000000000150';
const MFILE = '90000000-0000-0000-0000-000000000150';
const SYNC = '80000000-0000-0000-0000-000000000150';

async function cleanup() {
  await admin.from('user_file_imports').delete().eq('moodle_file_id', MFILE);
  await admin.from('user_course_syncs').delete().eq('id', SYNC);
  await admin.from('course_members').delete().eq('course_id', COURSE);
  await admin.from('courses').delete().eq('id', COURSE);
  await admin.from('moodle_files').delete().eq('id', MFILE);
  await admin.from('moodle_sections').delete().eq('id', SECTION);
  await admin.from('moodle_courses').delete().eq('id', MCOURSE);
  await admin.from('moodle_instances').delete().eq('id', INSTANCE);
}

describe('getMoodleMaterialsForCourse for a member', () => {
  beforeAll(async () => {
    await cleanup();
    await admin
      .from('moodle_instances')
      .insert({ id: INSTANCE, domain: 'm150.example.edu', name: 'M150' });
    await admin.from('moodle_courses').insert({
      id: MCOURSE,
      instance_id: INSTANCE,
      moodle_course_id: '150',
      name: 'M Course',
    });
    await admin.from('moodle_sections').insert({
      id: SECTION,
      course_id: MCOURSE,
      moodle_section_id: '1',
      title: 'S1',
      position: 0,
    });
    await admin.from('moodle_files').insert({
      id: MFILE,
      section_id: SECTION,
      type: 'file',
      moodle_url: 'https://m150/file',
      file_name: 'm.pdf',
      content_hash: 'h150',
      position: 0,
    });
    await admin
      .from('courses')
      .insert({ id: COURSE, user_id: TEST_USER_A.id, name: 'Shared' });
    await admin.from('course_members').insert({
      course_id: COURSE,
      user_id: TEST_USER_B.id,
      role: 'viewer',
    });
    await admin.from('user_course_syncs').insert({
      id: SYNC,
      user_id: TEST_USER_A.id,
      moodle_course_id: MCOURSE,
      course_id: COURSE,
    });
    await admin.from('user_file_imports').insert({
      user_id: TEST_USER_A.id,
      moodle_file_id: MFILE,
      sync_id: SYNC,
      status: 'imported',
    });
  });
  afterAll(cleanup);

  it('member sees the owner-imported Moodle file', async () => {
    const { getMoodleMaterialsForCourse } = await import('../moodle-materials');
    const sections = await getMoodleMaterialsForCourse(COURSE);
    const fileNames = sections.flatMap((s) =>
      (s.files ?? []).map((f) => f.file_name),
    );
    expect(fileNames).toContain('m.pdf');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test:integration -- moodle-materials-shared`
Expected: FAIL — `getMoodleMaterialsForCourse` resolves B's own sync (none) → returns `[]`.

- [ ] **Step 3: Update `getMoodleMaterialsForCourse` to use the owner-view RPC**

In `src/lib/actions/moodle-materials.ts`, replace the caller's sync lookup
(the block that does `admin.from('user_course_syncs').select(...).eq('user_id',
user.id).eq('course_id', courseId)`) with the membership-aware view, and filter
the section files to the owner-imported set:

```ts
// after auth + `const admin = createAdminClient();`
const supabase = await createClient(); // request-scoped client carries the JWT
const { data: viewRows } = await supabase.rpc('course_moodle_view', {
  p_course_id: courseId,
});
const view = Array.isArray(viewRows) ? viewRows[0] : viewRows;
const moodleCourseId: string | null = view?.moodle_course_id ?? null;
const importedIds: string[] = view?.imported_file_ids ?? [];
if (!moodleCourseId || importedIds.length === 0) return [];

const { data: sections } = await admin
  .from('moodle_sections')
  .select(
    'id, title, position, moodle_files(id, file_name, type, moodle_url, storage_path, mime_type, file_size, position)',
  )
  .eq('course_id', moodleCourseId)
  .order('position');
```

Then, wherever the existing code filters files by the user's imports, filter by
`importedIds` instead (keep only files whose `id` is in `importedIds`). The
rest of the function (signed-URL generation, DTO mapping) is unchanged.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test:integration -- moodle-materials-shared`
Expected: PASS.

- [ ] **Step 5: Update `searchContext` Moodle resolution**

In `src/lib/actions/ai-context.ts` `searchContext`, replace the per-caller
resolution of `moodleCourseId` + `importedMoodleFileIds` (the
`user_course_syncs` / `user_file_imports` reads) with the same RPC so members
get the owner's view:

```ts
const { data: viewRows } = await supabase.rpc('course_moodle_view', {
  p_course_id: params.courseId,
});
const view = Array.isArray(viewRows) ? viewRows[0] : viewRows;
const moodleCourseId: string | null = view?.moodle_course_id ?? null;
const importedMoodleFileIds: string[] = view?.imported_file_ids ?? [];
```

Then pass `moodleCourseId` and `importedMoodleFileIds` into `matchEmbeddings`
exactly as before.

- [ ] **Step 6: Run RAG unit tests for regression**

Run: `pnpm test -- ai-context`
Expected: PASS. _If a unit test mocked `user_course_syncs`/`user_file_imports`
chains, update that mock to stub `supabase.rpc('course_moodle_view', …)`
returning `{ moodle_course_id, imported_file_ids }` instead._

- [ ] **Step 7: Commit**

```bash
git add src/lib/actions/moodle-materials.ts src/lib/actions/ai-context.ts src/lib/actions/__tests__/moodle-materials-shared.integration.test.ts
git commit -m "feat(sharing): members see owner's Moodle imports (display + RAG)"
```

---

### Task 16: Scope owner course-list queries + "Shared with me" query

**Files:**

- Modify: `src/app/(dashboard)/dashboard/page.tsx`
- Modify: `src/lib/queries/courses.ts` (`getCoursesByFolder`)
- Modify: `src/app/(dashboard)/dashboard/folders/[folderId]/page.tsx`
- Create: `src/lib/queries/shared-courses.ts`
- Test: `src/__tests__/integration/shared-courses-query.integration.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/__tests__/integration/shared-courses-query.integration.test.ts
import { describe, it, expect, afterAll, beforeAll } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  createAdminClient,
  createUserClient,
  TEST_USER_A,
  TEST_USER_B,
} from '@/test/supabase-client';

const admin = createAdminClient();
const OWNED_B = 'c0000000-0000-0000-0000-000000000160';
const SHARED_A = 'c0000000-0000-0000-0000-000000000161';

async function cleanup() {
  await admin.from('course_members').delete().in('course_id', [SHARED_A]);
  await admin.from('courses').delete().in('id', [OWNED_B, SHARED_A]);
}

describe('owner-scoped vs shared-with-me course queries', () => {
  let clientB: SupabaseClient;
  beforeAll(async () => {
    clientB = await createUserClient(TEST_USER_B);
    await cleanup();
    await admin.from('courses').insert([
      { id: OWNED_B, user_id: TEST_USER_B.id, name: 'B owns' },
      { id: SHARED_A, user_id: TEST_USER_A.id, name: 'A shares with B' },
    ]);
    await admin.from('course_members').insert({
      course_id: SHARED_A,
      user_id: TEST_USER_B.id,
      role: 'viewer',
    });
  });
  afterAll(cleanup);

  it('owner-scoped query (user_id filter) returns only B-owned courses', async () => {
    const { data } = await clientB
      .from('courses')
      .select('id')
      .eq('user_id', TEST_USER_B.id)
      .is('folder_id', null);
    const ids = (data ?? []).map((r) => r.id);
    expect(ids).toContain(OWNED_B);
    expect(ids).not.toContain(SHARED_A);
  });

  it('shared-with-me query returns A-shared course but not B-owned', async () => {
    const { getSharedWithMe } = await import('@/lib/queries/shared-courses');
    const courses = await getSharedWithMe(clientB, TEST_USER_B.id);
    const ids = courses.map((c) => c.id);
    expect(ids).toContain(SHARED_A);
    expect(ids).not.toContain(OWNED_B);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test:integration -- shared-courses-query`
Expected: FAIL — `@/lib/queries/shared-courses` does not exist (the first test passes only after the queries are scoped, but the import error fails the file).

- [ ] **Step 3: Create the shared-with-me query**

```ts
// src/lib/queries/shared-courses.ts
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Course } from '@/types/database';

export interface SharedCourse extends Course {
  member_role: 'viewer' | 'contributor';
  owner_name: string | null;
}

export async function getSharedWithMe(
  supabase: SupabaseClient,
  userId: string,
): Promise<SharedCourse[]> {
  const { data, error } = await supabase
    .from('course_members')
    .select(
      'role, courses(id, user_id, folder_id, name, color, position, created_at, updated_at, profiles(display_name))',
    )
    .eq('user_id', userId);
  if (error) throw new Error(error.message);

  return (data ?? [])
    .map((row) => {
      const c = (Array.isArray(row.courses) ? row.courses[0] : row.courses) as
        | (Course & {
            profiles:
              | { display_name: string | null }
              | { display_name: string | null }[]
              | null;
          })
        | null;
      if (!c) return null;
      const prof = Array.isArray(c.profiles) ? c.profiles[0] : c.profiles;
      return {
        ...c,
        member_role: row.role as 'viewer' | 'contributor',
        owner_name: prof?.display_name ?? null,
      } as SharedCourse;
    })
    .filter((c): c is SharedCourse => c !== null);
}
```

- [ ] **Step 4: Scope the owner queries**

In `src/app/(dashboard)/dashboard/page.tsx`, add `.eq('user_id', user.id)` to
the root-courses query (the `from('courses').select(...).is('folder_id', null)`
at ~line 51).

In `src/lib/queries/courses.ts` `getCoursesByFolder` (~line 6), add
`.eq('user_id', userId)` — pass/derive `userId` from the authenticated user
(the function already takes a `supabase` client; fetch the user inside or accept
a `userId` param; match the existing call sites).

In `src/app/(dashboard)/dashboard/folders/[folderId]/page.tsx` (~line 49), add
`.eq('user_id', user.id)` to the `from('courses')` query.

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm test:integration -- shared-courses-query`
Expected: PASS (2 tests).

- [ ] **Step 6: Commit**

```bash
git add src/lib/queries/shared-courses.ts src/app/\(dashboard\)/dashboard/page.tsx src/lib/queries/courses.ts "src/app/(dashboard)/dashboard/folders/[folderId]/page.tsx" src/__tests__/integration/shared-courses-query.integration.test.ts
git commit -m "feat(sharing): scope owned-course queries by user_id + shared-with-me query"
```

---

## Phase 3 — UI

### Task 17: Types

**Files:**

- Modify: `src/types/database.ts`
- Test: none (types only; verified by `pnpm build`/`tsc` later).

- [ ] **Step 1: Add types**

```ts
// src/types/database.ts (append)
export type CourseRole = 'viewer' | 'contributor';

export interface CourseMember {
  id: string;
  course_id: string;
  user_id: string;
  role: CourseRole;
  created_at: string;
}

export interface CourseShareLink {
  id: string;
  course_id: string;
  token: string;
  role: CourseRole;
  is_active: boolean;
  created_at: string;
}
```

- [ ] **Step 2: Typecheck**

Run: `pnpm exec tsc --noEmit`
Expected: PASS (no new errors).

- [ ] **Step 3: Commit**

```bash
git add src/types/database.ts
git commit -m "feat(sharing): add CourseMember + CourseShareLink types"
```

---

### Task 18: Share dialog component

**Files:**

- Create: `src/components/dashboard/share-course-dialog.tsx`
- Test: `src/components/dashboard/__tests__/share-course-dialog.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
// src/components/dashboard/__tests__/share-course-dialog.test.tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ShareCourseDialog } from '../share-course-dialog';

vi.mock('@/lib/actions/course-sharing', () => ({
  createOrUpdateShareLink: vi.fn(async () => ({ token: 'abc123token' })),
  deactivateShareLink: vi.fn(async () => {}),
  regenerateShareLink: vi.fn(async () => ({ token: 'new456token' })),
  listMembers: vi.fn(async () => [
    { user_id: 'u-b', role: 'viewer', display_name: 'B', email: 'b@x.dev' },
  ]),
  updateMemberRole: vi.fn(async () => {}),
  removeMember: vi.fn(async () => {}),
}));

describe('ShareCourseDialog', () => {
  beforeEach(() => vi.clearAllMocks());

  it('generates a viewer link and shows the URL', async () => {
    const user = userEvent.setup();
    render(
      <ShareCourseDialog courseId="course-1" open onOpenChange={() => {}} />,
    );
    await user.click(
      screen.getByRole('button', { name: /create.*viewer link/i }),
    );
    await waitFor(() =>
      expect(screen.getByDisplayValue(/abc123token/)).toBeInTheDocument(),
    );
  });

  it('lists current members', async () => {
    render(
      <ShareCourseDialog courseId="course-1" open onOpenChange={() => {}} />,
    );
    await waitFor(() => expect(screen.getByText('B')).toBeInTheDocument());
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test -- share-course-dialog`
Expected: FAIL — component does not exist.

- [ ] **Step 3: Create the component**

```tsx
// src/components/dashboard/share-course-dialog.tsx
'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import {
  createOrUpdateShareLink,
  deactivateShareLink,
  regenerateShareLink,
  listMembers,
  updateMemberRole,
  removeMember,
  type ShareRole,
  type MemberRow,
} from '@/lib/actions/course-sharing';

interface ShareCourseDialogProps {
  courseId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

function shareUrl(token: string): string {
  if (typeof window === 'undefined') return '/share/' + token;
  return `${window.location.origin}/share/${token}`;
}

export function ShareCourseDialog({
  courseId,
  open,
  onOpenChange,
}: ShareCourseDialogProps) {
  const [tokens, setTokens] = useState<Record<ShareRole, string | null>>({
    viewer: null,
    contributor: null,
  });
  const [members, setMembers] = useState<MemberRow[]>([]);
  const [busy, setBusy] = useState(false);

  const refreshMembers = useCallback(async () => {
    try {
      setMembers(await listMembers(courseId));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to load members');
    }
  }, [courseId]);

  useEffect(() => {
    if (open) refreshMembers();
  }, [open, refreshMembers]);

  async function makeLink(role: ShareRole) {
    setBusy(true);
    try {
      const { token } = await createOrUpdateShareLink({ courseId, role });
      setTokens((t) => ({ ...t, [role]: token }));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to create link');
    } finally {
      setBusy(false);
    }
  }

  async function regen(role: ShareRole) {
    setBusy(true);
    try {
      const { token } = await regenerateShareLink({ courseId, role });
      setTokens((t) => ({ ...t, [role]: token }));
      toast.success('New link generated; the old one no longer works');
    } finally {
      setBusy(false);
    }
  }

  async function disable(role: ShareRole) {
    setBusy(true);
    try {
      await deactivateShareLink({ courseId, role });
      setTokens((t) => ({ ...t, [role]: null }));
    } finally {
      setBusy(false);
    }
  }

  function copy(token: string) {
    navigator.clipboard?.writeText(shareUrl(token));
    toast.success('Link copied');
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Share course</DialogTitle>
          <DialogDescription>
            Anyone with a link can join. Viewers can open materials;
            contributors can also add files. Your notes stay private.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {(['viewer', 'contributor'] as ShareRole[]).map((role) => (
            <div key={role} className="space-y-2">
              <Label className="capitalize">{role} link</Label>
              {tokens[role] ? (
                <div className="flex gap-2">
                  <Input readOnly value={shareUrl(tokens[role]!)} />
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => copy(tokens[role]!)}
                  >
                    Copy
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    disabled={busy}
                    onClick={() => regen(role)}
                  >
                    Regenerate
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    disabled={busy}
                    onClick={() => disable(role)}
                  >
                    Disable
                  </Button>
                </div>
              ) : (
                <Button
                  type="button"
                  variant="outline"
                  disabled={busy}
                  onClick={() => makeLink(role)}
                >
                  Create {role} link
                </Button>
              )}
            </div>
          ))}

          <div className="space-y-2">
            <Label>Members</Label>
            {members.length === 0 ? (
              <p className="text-sm text-muted-foreground">No members yet.</p>
            ) : (
              <ul className="space-y-1">
                {members.map((m) => (
                  <li
                    key={m.user_id}
                    className="flex items-center justify-between gap-2 text-sm"
                  >
                    <span>{m.display_name ?? m.email ?? m.user_id}</span>
                    <span className="flex items-center gap-2">
                      <select
                        className="rounded border px-1 py-0.5 text-xs"
                        value={m.role}
                        onChange={async (e) => {
                          await updateMemberRole({
                            courseId,
                            userId: m.user_id,
                            role: e.target.value as ShareRole,
                          });
                          await refreshMembers();
                        }}
                      >
                        <option value="viewer">viewer</option>
                        <option value="contributor">contributor</option>
                      </select>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={async () => {
                          await removeMember({ courseId, userId: m.user_id });
                          await refreshMembers();
                        }}
                      >
                        Remove
                      </Button>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test -- share-course-dialog`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add src/components/dashboard/share-course-dialog.tsx src/components/dashboard/__tests__/share-course-dialog.test.tsx
git commit -m "feat(sharing): Share course dialog"
```

---

### Task 19: Course page — Share button + role-aware controls + owner banner

**Files:**

- Modify: `src/app/(dashboard)/dashboard/courses/[courseId]/page.tsx`
- Create: `src/components/dashboard/share-course-button.tsx` (client wrapper that owns dialog open-state)

- [ ] **Step 1: Create the Share button client wrapper**

```tsx
// src/components/dashboard/share-course-button.tsx
'use client';

import { useState } from 'react';
import { Share2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ShareCourseDialog } from './share-course-dialog';

export function ShareCourseButton({ courseId }: { courseId: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
        <Share2 className="mr-2 size-4" />
        Share
      </Button>
      <ShareCourseDialog
        courseId={courseId}
        open={open}
        onOpenChange={setOpen}
      />
    </>
  );
}
```

- [ ] **Step 2: Compute the viewer's role in the course page (server component)**

In `src/app/(dashboard)/dashboard/courses/[courseId]/page.tsx`, after fetching
`course` and `user`, add:

```ts
const isOwner = course.user_id === user?.id;
let role: 'owner' | 'viewer' | 'contributor' = 'owner';
if (!isOwner) {
  const { data: membership } = await supabase
    .from('course_members')
    .select('role')
    .eq('course_id', courseId)
    .eq('user_id', user!.id)
    .maybeSingle();
  role = (membership?.role as 'viewer' | 'contributor') ?? 'viewer';
}
const canContribute = isOwner || role === 'contributor';
```

- [ ] **Step 3: Render Share button (owner) + gate upload/create by `canContribute`**

In the header button row:

```tsx
{
  isOwner && <ShareCourseButton courseId={courseId} />;
}
{
  /* ...existing AiChatWrapper... */
}
{
  canContribute && (
    <CreateDocumentDialog courseId={courseId} /* existing props */ />
  );
}
{
  canContribute && (
    <PersonalFileUpload
      courseId={courseId}
      userId={user?.id ?? ''}
      category="material"
      label="Import File"
    />
  );
}
```

Add the import: `import { ShareCourseButton } from '@/components/dashboard/share-course-button';`

- [ ] **Step 4: Show "Shared by {owner}" banner for members**

For non-owners, fetch the owner's display name and render a small banner under
the course title:

```tsx
{
  !isOwner && (
    <p className="text-sm text-muted-foreground">
      Shared by {ownerName ?? 'another user'}
    </p>
  );
}
```

Where `ownerName` comes from a `profiles` lookup:

```ts
let ownerName: string | null = null;
if (!isOwner) {
  const { data: prof } = await supabase
    .from('profiles')
    .select('display_name')
    .eq('id', course.user_id)
    .maybeSingle();
  ownerName = prof?.display_name ?? null;
}
```

- [ ] **Step 5: Pass ownership to file items (for Task 20)**

When rendering `MaterialItem` / `PersonalFileItem`, pass
`currentUserId={user?.id}` and `isOwner={isOwner}` (props added in Task 20).

- [ ] **Step 6: Typecheck + build the page**

Run: `pnpm exec tsc --noEmit`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add "src/app/(dashboard)/dashboard/courses/[courseId]/page.tsx" src/components/dashboard/share-course-button.tsx
git commit -m "feat(sharing): course page Share button, role-aware controls, owner banner"
```

---

### Task 20: Gate per-file delete by ownership

**Files:**

- Modify: `src/components/dashboard/material-item.tsx`
- Modify: `src/components/dashboard/personal-file-item.tsx`
- Test: `src/components/dashboard/__tests__/material-item-gating.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
// src/components/dashboard/__tests__/material-item-gating.test.tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { PersonalFileItem } from '../personal-file-item';
import type { PersonalFile } from '@/types/database';

vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({
    storage: { from: () => ({ createSignedUrl: vi.fn() }) },
  }),
}));

const base: PersonalFile = {
  id: 'pf1',
  user_id: 'owner-A',
  course_id: 'c1',
  category: 'material',
  file_name: 'a.pdf',
  display_name: 'a',
  mime_type: 'application/pdf',
  file_size: 10,
  storage_path: 'owner-A/c1/a.pdf',
  created_at: '',
  updated_at: '',
};

describe('PersonalFileItem delete gating', () => {
  it('hides delete for a file the current user did not upload (and is not owner)', () => {
    render(
      <PersonalFileItem file={base} currentUserId="member-B" isOwner={false} />,
    );
    expect(
      screen.queryByRole('button', { name: /delete/i }),
    ).not.toBeInTheDocument();
  });

  it('shows delete when the current user uploaded it', () => {
    render(
      <PersonalFileItem
        file={{ ...base, user_id: 'member-B' }}
        currentUserId="member-B"
        isOwner={false}
      />,
    );
    expect(screen.getByRole('button', { name: /delete/i })).toBeInTheDocument();
  });
});
```

_Note: the delete `Button` currently has no accessible name (icon only). Add
`aria-label="Delete file"` to the delete button in Step 3 so the query works._

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test -- material-item-gating`
Expected: FAIL — `PersonalFileItem` doesn't accept `currentUserId`/`isOwner` and always renders delete.

- [ ] **Step 3: Add props + gating to both items**

In `src/components/dashboard/personal-file-item.tsx`:

```tsx
interface PersonalFileItemProps {
  file: PersonalFile;
  currentUserId?: string;
  isOwner?: boolean;
}

export function PersonalFileItem({
  file,
  currentUserId,
  isOwner = false,
}: PersonalFileItemProps) {
  const canDelete = isOwner || file.user_id === currentUserId;
  // ...existing logic...
  return (
    <div /* ...row... */>
      {/* ...name, size... */}
      {canDelete && (
        <Button
          variant="ghost"
          size="icon-xs"
          aria-label="Delete file"
          onClick={handleDelete}
          disabled={deleting}
          className="shrink-0 opacity-0 group-hover:opacity-100"
        >
          <Trash2 className="size-3.5 text-muted-foreground" />
        </Button>
      )}
    </div>
  );
}
```

Apply the identical pattern to `src/components/dashboard/material-item.tsx`
(add `currentUserId?` + `isOwner?` props, compute `canDelete`, wrap the delete
`Button` in `{canDelete && ...}`, add `aria-label="Delete file"`).

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test -- material-item-gating`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add src/components/dashboard/personal-file-item.tsx src/components/dashboard/material-item.tsx src/components/dashboard/__tests__/material-item-gating.test.tsx
git commit -m "feat(sharing): gate per-file delete button by ownership"
```

---

### Task 21: Dashboard "Shared with me" + CourseCard shared mode

**Files:**

- Modify: `src/components/dashboard/course-card.tsx`
- Modify: `src/app/(dashboard)/dashboard/page.tsx`
- Create: `src/components/dashboard/leave-course-button.tsx`
- Test: `src/components/dashboard/__tests__/course-card-shared.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
// src/components/dashboard/__tests__/course-card-shared.test.tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { CourseCard } from '../course-card';
import type { Course } from '@/types/database';

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock('@/lib/actions/courses', () => ({ deleteCourse: vi.fn() }));
vi.mock('@/lib/actions/course-sharing', () => ({ leaveCourse: vi.fn() }));

const course: Course = {
  id: 'c1',
  user_id: 'owner-A',
  folder_id: null,
  name: 'Shared Course',
  color: '#6B7280',
  position: 0,
  created_at: '',
  updated_at: '',
};

describe('CourseCard shared mode', () => {
  it('renders a Shared badge and owner name when shared=true', () => {
    render(<CourseCard course={course} shared ownerName="Alice" />);
    expect(screen.getByText(/shared/i)).toBeInTheDocument();
    expect(screen.getByText(/alice/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test -- course-card-shared`
Expected: FAIL — `CourseCard` doesn't accept `shared`/`ownerName`.

- [ ] **Step 3: Create the leave button**

```tsx
// src/components/dashboard/leave-course-button.tsx
'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { DropdownMenuItem } from '@/components/ui/dropdown-menu';
import { leaveCourse } from '@/lib/actions/course-sharing';

export function LeaveCourseMenuItem({ courseId }: { courseId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  return (
    <DropdownMenuItem
      className="text-destructive"
      disabled={busy}
      onClick={async (e) => {
        e.stopPropagation();
        if (
          !window.confirm(
            'Remove this course from your list? This deletes the files you added to it. Your own notes are kept (moved to your home).',
          )
        )
          return;
        setBusy(true);
        try {
          await leaveCourse(courseId);
          toast.success('Removed from your list');
          router.refresh();
        } catch (err) {
          toast.error(err instanceof Error ? err.message : 'Failed to remove');
        } finally {
          setBusy(false);
        }
      }}
    >
      Remove from my list
    </DropdownMenuItem>
  );
}
```

- [ ] **Step 4: Extend CourseCard**

In `src/components/dashboard/course-card.tsx`:

```tsx
interface CourseCardProps {
  course: Course;
  shared?: boolean;
  ownerName?: string | null;
}

export function CourseCard({
  course,
  shared = false,
  ownerName,
}: CourseCardProps) {
  // ...existing state/handlers...
  return (
    <div /* card */>
      {/* icon + name row: */}
      <div className="flex items-center gap-2">
        <span>{course.name}</span>
        {shared && (
          <span className="rounded bg-muted px-1.5 py-0.5 text-xs text-muted-foreground">
            Shared
          </span>
        )}
      </div>
      {shared && ownerName && (
        <p className="text-xs text-muted-foreground">by {ownerName}</p>
      )}

      {/* dropdown menu: */}
      {/* If shared (member view): show <LeaveCourseMenuItem courseId={course.id} /> */}
      {/* else (owner): keep existing Edit + Delete items */}
    </div>
  );
}
```

Add `import { LeaveCourseMenuItem } from './leave-course-button';` and replace
the dropdown body with a conditional: when `shared`, render only
`<LeaveCourseMenuItem courseId={course.id} />`; otherwise render the existing
Edit + Delete items.

- [ ] **Step 5: Add the "Shared with me" section to the dashboard**

In `src/app/(dashboard)/dashboard/page.tsx`, after the owned "Courses" section:

```tsx
// in the data-fetching block:
import { getSharedWithMe } from '@/lib/queries/shared-courses';
const sharedCourses = await getSharedWithMe(supabase, user!.id);

// in the JSX, after the Courses section:
{
  sharedCourses.length > 0 && (
    <div className="mt-8">
      <h2 className="mb-4 text-lg font-semibold">Shared with me</h2>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
        {sharedCourses.map((c) => (
          <CourseCard key={c.id} course={c} shared ownerName={c.owner_name} />
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 6: Run test + typecheck**

Run: `pnpm test -- course-card-shared && pnpm exec tsc --noEmit`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/components/dashboard/course-card.tsx src/components/dashboard/leave-course-button.tsx "src/app/(dashboard)/dashboard/page.tsx" src/components/dashboard/__tests__/course-card-shared.test.tsx
git commit -m "feat(sharing): Shared-with-me section + member Remove-from-list"
```

---

### Task 22: Honor `next` redirect after login (if missing)

**Files:**

- Modify: login flow (path discovered in Task 12 Step 2), only if `next` is not already honored.

- [ ] **Step 1: Check whether `next` is honored**

Run: `grep -rn "searchParams\|next" src/app/**/login/**/* 2>/dev/null`
If the login page/action already redirects to a `next` param, **skip to Step 3** (no change needed) and note that in the commit.

- [ ] **Step 2: Add `next` support (only if missing)**

In the login server action / page, read `next` from the URL search params and
`redirect(next ?? '/dashboard')` after a successful sign-in. Validate `next`
starts with `/` (avoid open-redirect):

```ts
const next =
  typeof rawNext === 'string' && rawNext.startsWith('/')
    ? rawNext
    : '/dashboard';
redirect(next);
```

- [ ] **Step 3: Commit (or note no-op)**

```bash
git add -A
git commit -m "feat(sharing): honor next= redirect for share-link login" --allow-empty
```

---

## Phase 4 — E2E + registry

### Task 23: E2E sharing flows + loginAs helper + registry

**Files:**

- Modify: `e2e/helpers/auth.ts` (add `loginAs`)
- Create: `e2e/sharing.spec.ts`
- Modify: `e2e/TEST_REGISTRY.md`

- [ ] **Step 1: Add the `loginAs` helper**

```ts
// e2e/helpers/auth.ts (append; keep existing login())
export async function loginAs(
  page: import('@playwright/test').Page,
  email: string,
  password: string,
) {
  await page.goto('/login');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: /sign in/i }).click();
  await page.waitForURL('**/dashboard**');
}
```

- [ ] **Step 2: Write the E2E spec**

```ts
// e2e/sharing.spec.ts
import { test, expect } from '@playwright/test';
import { login, loginAs } from './helpers/auth';

const OWNER = { email: 'test@typenote.dev', password: 'Test1234' };
const MEMBER = { email: 'test-b@typenote.dev', password: 'Test1234' };

async function createCourse(
  page: import('@playwright/test').Page,
  name: string,
) {
  await page.getByRole('button', { name: 'New Course' }).click();
  await page.getByLabel('Name').fill(name);
  await page.getByRole('button', { name: 'Create Course' }).click();
  await page.getByText(name).click();
  await expect(page).toHaveURL(/\/dashboard\/courses\//, { timeout: 10_000 });
}

async function getShareUrl(
  page: import('@playwright/test').Page,
  role: 'viewer' | 'contributor',
): Promise<string> {
  await page.getByRole('button', { name: 'Share' }).click();
  await page
    .getByRole('button', { name: new RegExp(`create ${role} link`, 'i') })
    .click();
  const input = page.getByDisplayValue(/\/share\//);
  await expect(input).toBeVisible({ timeout: 10_000 });
  return await input.inputValue();
}

test.describe('Course sharing', () => {
  test('contributor link: member joins, sees materials, uploads, owner sees it', async ({
    browser,
  }) => {
    test.setTimeout(90_000);
    const ownerCtx = await browser.newContext();
    const ownerPage = await ownerCtx.newPage();
    await loginAs(ownerPage, OWNER.email, OWNER.password);
    const courseName = `Share E2E ${Date.now()}`;
    await createCourse(ownerPage, courseName);

    // Owner uploads a file
    const fileInput = ownerPage.locator('input[type="file"]').first();
    await fileInput.setInputFiles({
      name: `owner-${Date.now()}.pdf`,
      mimeType: 'application/pdf',
      buffer: Buffer.from('%PDF-1.4 owner'),
    });
    await expect(ownerPage.getByText('File imported')).toBeVisible({
      timeout: 20_000,
    });

    const url = await getShareUrl(ownerPage, 'contributor');

    // Member joins via link
    const memberCtx = await browser.newContext();
    const memberPage = await memberCtx.newPage();
    await loginAs(memberPage, MEMBER.email, MEMBER.password);
    await memberPage.goto(url);
    await expect(memberPage).toHaveURL(/\/dashboard\/courses\//, {
      timeout: 15_000,
    });
    await expect(
      memberPage.getByRole('heading', { name: courseName }),
    ).toBeVisible({ timeout: 10_000 });

    // Member (contributor) uploads
    const memberInput = memberPage.locator('input[type="file"]').first();
    await memberInput.setInputFiles({
      name: `member-${Date.now()}.pdf`,
      mimeType: 'application/pdf',
      buffer: Buffer.from('%PDF-1.4 member'),
    });
    await expect(memberPage.getByText('File imported')).toBeVisible({
      timeout: 20_000,
    });

    await ownerCtx.close();
    await memberCtx.close();
  });

  test('viewer link: member cannot upload', async ({ browser }) => {
    test.setTimeout(90_000);
    const ownerCtx = await browser.newContext();
    const ownerPage = await ownerCtx.newPage();
    await loginAs(ownerPage, OWNER.email, OWNER.password);
    const courseName = `Viewer E2E ${Date.now()}`;
    await createCourse(ownerPage, courseName);
    const url = await getShareUrl(ownerPage, 'viewer');

    const memberCtx = await browser.newContext();
    const memberPage = await memberCtx.newPage();
    await loginAs(memberPage, MEMBER.email, MEMBER.password);
    await memberPage.goto(url);
    await expect(
      memberPage.getByRole('heading', { name: courseName }),
    ).toBeVisible({ timeout: 15_000 });

    await expect(
      memberPage.getByRole('button', { name: 'Import File' }),
    ).toHaveCount(0);

    await ownerCtx.close();
    await memberCtx.close();
  });

  test('leave: member removes course from list; course persists for owner', async ({
    browser,
  }) => {
    test.setTimeout(90_000);
    const ownerCtx = await browser.newContext();
    const ownerPage = await ownerCtx.newPage();
    await loginAs(ownerPage, OWNER.email, OWNER.password);
    const courseName = `Leave E2E ${Date.now()}`;
    await createCourse(ownerPage, courseName);
    const url = await getShareUrl(ownerPage, 'viewer');

    const memberCtx = await browser.newContext();
    const memberPage = await memberCtx.newPage();
    await loginAs(memberPage, MEMBER.email, MEMBER.password);
    await memberPage.goto(url);
    await expect(
      memberPage.getByRole('heading', { name: courseName }),
    ).toBeVisible({ timeout: 15_000 });

    // Back to dashboard; "Shared with me" shows the course
    await memberPage.goto('/dashboard');
    await expect(memberPage.getByText('Shared with me')).toBeVisible();
    const card = memberPage.getByText(courseName);
    await expect(card).toBeVisible();

    // Remove from my list (auto-accept the confirm dialog)
    memberPage.on('dialog', (d) => d.accept());
    await card
      .locator('xpath=ancestor::*[self::div][1]')
      .getByRole('button')
      .last()
      .click(); // open the dropdown; adjust selector to the card menu
    await memberPage.getByText('Remove from my list').click();
    await expect(memberPage.getByText(courseName)).toHaveCount(0, {
      timeout: 10_000,
    });

    // Owner still has it
    await ownerPage.goto('/dashboard');
    await expect(ownerPage.getByText(courseName)).toBeVisible();

    await ownerCtx.close();
    await memberCtx.close();
  });
});
```

_If the dropdown selector in the leave test is brittle, add a
`data-testid="course-menu-trigger"` to the CourseCard menu trigger in Task 21
and select by it here._

- [ ] **Step 3: Run the E2E spec**

Run: `pnpm test:e2e -- sharing`
Expected: PASS (3 tests). _Requires local Supabase running + `pnpm dev` (Playwright auto-starts dev per `playwright.config.ts`)._

- [ ] **Step 4: Update TEST_REGISTRY.md**

Append:

```markdown
## Course Sharing (`e2e/sharing.spec.ts`) — IMPLEMENTED

- [x] Contributor link: member joins, sees materials, uploads a file, owner sees it
- [x] Viewer link: member cannot see upload controls
- [x] Leave: member removes course from list; course persists for owner
- [ ] Privacy: member's note in a shared course is invisible to the owner (covered by integration test `open-shared-file` / RLS; add E2E if needed)
- [ ] AI: member's chat cites an owner-uploaded file (manual until AI key is available in CI — see `ai-e2e-no-gemini-key-in-ci`)
```

- [ ] **Step 5: Commit**

```bash
git add e2e/helpers/auth.ts e2e/sharing.spec.ts e2e/TEST_REGISTRY.md
git commit -m "test(sharing): E2E join/contribute/viewer/leave flows + loginAs helper"
```

---

## Final verification

- [ ] **Run the full suite**

Run: `pnpm test && pnpm test:integration && pnpm test:e2e`
Expected: all green.

- [ ] **Build**

Run: `pnpm build`
Expected: success (no type errors).

- [ ] **Open PR to `dev`**

```bash
git push -u origin feat/course-sharing
gh pr create --base dev --title "feat: course sharing (materials-only, link-based)" --body "Implements docs/superpowers/specs/2026-05-26-course-sharing-design.md. See plan docs/superpowers/plans/2026-05-26-course-sharing.md."
```

---

## Notes for the implementer

- **Migration edits require `pnpm supabase db reset`** to take effect locally (it re-runs all migrations + `seed.sql`). Integration tests assume the seeded users `TEST_USER_A` / `TEST_USER_B` exist (`supabase/seed.sql`).
- **RLS-deny tests assert empty results, not errors** — Supabase returns `data: []` (not an error) when RLS filters a SELECT, and silently no-ops a filtered UPDATE/DELETE. Verify side-effects with the admin client.
- **Owner is never a `course_members` row** — `is_course_*` helpers fold the owner in. Don't add an owner membership row anywhere.
- **`course_materials` has no live upload path** — its policies are defense-in-depth; the real surface is `personal_files` + Moodle. Don't build UI around `course_materials`.
- **Service-role usage is intentional and gated** — `removeMembership` and `deleteCourse` use the admin client only after an explicit owner/self authorization check.
