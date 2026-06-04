# Course sharing (materials only, link-based)

**Date:** 2026-05-26
**Status:** Draft — awaiting user approval
**Branch / PR:** `feat/course-sharing` → PR against `dev`

---

## 1. Problem & context

Today every Typenote entity is single-owner. `courses`, `course_materials`,
`personal_files`, `documents`, `ai_conversations` all carry a `user_id`, and
every RLS policy is `auth.uid() = user_id`. A course belongs to exactly one
person; there is no concept of membership, sharing, or collaborators.

We want **any course to be shareable** so that its **materials** (imported
files) become visible to other people, while each person's **personal notes**
stay private. Three real scenarios drive this:

1. A study group of classmates pooling the same materials.
2. A public link anyone can open.
3. A teacher distributing one authoritative course to students inside the app.

A single mechanism — a **share link** with an owner-chosen role — covers all
three. The one existing precedent for "shared content + per-user access" is the
Moodle registry (`moodle_files` have no `user_id`; access is gated by the
per-user `user_file_imports` whitelist), and we reuse that mental model.

## 2. Goals

1. **Any course can be shared** via a link. The owner picks the role the link
   grants: **Viewer** (open/download materials) or **Contributor** (also add
   their own imported files to the shared pool).
2. **Materials are shared, personal notes are not.** The shared pool =
   `course_materials` + `personal_files` (any member, attributed) + the course
   **owner's** Moodle imports. The `documents` table (editor notes) is never
   shared.
3. **Database-enforced access (defense in depth).** Membership-based RLS via
   `SECURITY DEFINER` helper functions — a buggy query cannot leak another
   course's data.
4. **AI chat searches the shared pool.** In a shared course, RAG retrieves over
   all members' shared files (never anyone's private notes). Each member's
   questions count against their own quota.
5. **Owner stays in control.** Only the owner manages the link and members
   (change role, remove, deactivate/regenerate). Members can delete only files
   they added.
6. **Deleting a course never destroys anyone's private notes.**

## 3. Non-goals

- **Email/targeted invites.** Link-based only in v1. (A `course_share_links`
  row + `course_members` row; no pending-invite table.)
- **Contributors adding their own _Moodle_ imports to the shared pool.** The
  shared Moodle set is the **owner's** imports only. Contributors add files via
  normal upload (`course_materials` / `personal_files`). Unioning every member's
  Moodle whitelist is a fast follow-up.
- **Sharing personal notes / collaborative document editing.** Out of scope by
  design.
- **Real-time presence, comments, activity feed, notifications.** Not in v1.
- **Ownership transfer.** An owner who wants out deletes the course (which now
  preserves everyone's private notes — see §8).
- The deferred sibling features: NotebookLM-style study artifacts, and the
  materials-UX redesign. Tracked separately.

## 4. Agreed behavior (decisions)

| Question              | Decision                                                                                                                                                                                      |
| --------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Sharing model         | One **live** shared course (not a snapshot/copy). Owner adds a file → members see it immediately.                                                                                             |
| Access mechanism      | **Share link** with an embedded role. Up to one active Viewer link and one active Contributor link per course.                                                                                |
| Roles                 | `viewer` (read/open/download), `contributor` (also upload), plus implicit owner (manage everything).                                                                                          |
| Shared pool           | `course_materials` + `personal_files` (all members) + owner's Moodle imports.                                                                                                                 |
| Private               | `documents` (editor notes) — each member sees only their own, even inside a shared course.                                                                                                    |
| Who manages sharing   | Owner only.                                                                                                                                                                                   |
| Who can delete a file | Owner (any file) or the member who uploaded it (their own).                                                                                                                                   |
| Deletion model        | Owner: **Delete course** (removes the course + all files). Member: **Remove from my list** — deletes their contributed files, keeps their notes (unfiled); course persists for everyone else. |
| AI scope              | RAG over the shared pool; never private notes; per-user quota unchanged.                                                                                                                      |

## 5. Data model

### 5.1 New table — `course_members`

```sql
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
```

- The **owner is NOT stored here** — the owner is `courses.user_id`, the single
  source of truth. Helper functions (§6.1) treat owner ∪ members as "members".
- `unique (course_id, user_id)` makes joining idempotent.

### 5.2 New table — `course_share_links`

```sql
create table public.course_share_links (
  id         uuid primary key default gen_random_uuid(),
  course_id  uuid not null references public.courses(id) on delete cascade,
  token      text not null unique,
  role       text not null check (role in ('viewer', 'contributor')),
  is_active  boolean not null default true,
  created_at timestamptz not null default now()
);

create index course_share_links_course_idx on public.course_share_links(course_id);
-- At most one active link per (course, role):
create unique index course_share_links_active_role_idx
  on public.course_share_links(course_id, role)
  where is_active;
```

- `token` is a cryptographically random URL-safe string (≥ 22 chars, generated
  in the server action with `crypto.randomUUID()`-derived or `nanoid` bytes).
  Regenerating = set old `is_active=false`, insert a new row.

### 5.3 Changed FK — `documents.course_id`

`00004` declared `course_id uuid references public.courses(id) on delete
cascade`. We change it to **`on delete set null`** so a member's (and the
owner's) private notes survive when a shared course is deleted; they become
unfiled root documents. The existing `documents_folder_or_course` check
(`NOT (folder_id IS NOT NULL AND course_id IS NOT NULL)`) is still satisfied
(both null is allowed).

```sql
alter table public.documents drop constraint documents_course_id_fkey;
alter table public.documents
  add constraint documents_course_id_fkey
  foreign key (course_id) references public.courses(id) on delete set null;
```

(Constraint name verified: `00004` declares it as an inline unnamed FK never
renamed since, so Postgres auto-names it `documents_course_id_fkey`.)

### 5.4 Attribution — no change

`course_materials.user_id` and `personal_files.user_id` already record the
uploader, so "members delete only what they added" needs no new column.

## 6. Access enforcement

### 6.1 Helper functions (`SECURITY DEFINER`)

These run as the **table-owning role** (`SECURITY DEFINER`), which in Supabase
bypasses RLS — and that is what prevents infinite recursion (otherwise a
`course_members` policy that itself queried `course_members` would loop). It
also keeps the check fast and indexable. Because they bypass RLS, the
`courses` member-SELECT policy in §6.2 calling `is_course_member(id)` is **not**
a cycle (the function skips RLS on `courses`/`course_members`). `search_path` is
locked per Supabase guidance. `auth.uid()` still reads the request's JWT claim
under `DEFINER`. (Same pattern already used by
`20260413101143_create_document_versions.sql`.)

```sql
create or replace function public.is_course_member(p_course_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
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
```

`grant execute on function ... to authenticated;` for each.

### 6.2 RLS policy changes

Postgres OR-combines multiple _permissive_ policies, so we ADD member policies
alongside the existing owner ones for SELECT, and REPLACE the INSERT/UPDATE/
DELETE policies where they must also account for membership.

**`courses`** — add member read; owner keeps full control:

```sql
create policy "Members can view shared courses"
  on public.courses for select
  using (public.is_course_member(id));
```

(Existing owner SELECT/INSERT/UPDATE/DELETE policies unchanged.)

**`course_materials`** — replace INSERT/UPDATE/DELETE, add member SELECT. The
old INSERT (`auth.uid() = user_id`) is **too permissive** once courses are
visible: it would let any viewer/non-member insert a row with their own
`user_id` into someone else's course. We tighten it to require contributor
rights.

```sql
-- SELECT: any member of the course
create policy "Members can view course materials"
  on public.course_materials for select
  using (public.is_course_member(course_id));

-- INSERT: owner or contributor, stamping their own user_id
drop policy "Users can create own course materials" on public.course_materials;
create policy "Contributors can add course materials"
  on public.course_materials for insert
  with check (auth.uid() = user_id and public.is_course_contributor(course_id));

-- UPDATE: owner (any) or uploader (own)
drop policy "Users can update own course materials" on public.course_materials;
create policy "Owner or uploader can update course materials"
  on public.course_materials for update
  using (auth.uid() = user_id or public.is_course_owner(course_id));

-- DELETE: owner (any) or uploader (own)
drop policy "Users can delete own course materials" on public.course_materials;
create policy "Owner or uploader can delete course materials"
  on public.course_materials for delete
  using (auth.uid() = user_id or public.is_course_owner(course_id));
```

The existing `"Users can view own course materials"` SELECT policy can be
dropped (redundant — `is_course_member` covers the owner) or left in place
(harmless). We drop it for clarity. (Note: a `storage.objects` SELECT policy
also happens to be named `"Users can view own course materials"` in `00005` —
the `drop policy ... on public.course_materials` is table-qualified and won't
touch the storage one.)

> **Reality check on `course_materials`:** `createCourseMaterial`
> (`course-materials.ts:7`) currently has **no caller in `src/`** — the only
> live upload path is `PersonalFileUpload → personal_files`, and Moodle imports
> land in the Moodle registry. So the `course_materials` policies here are
> **defense-in-depth / forward-looking**; the _live_ shared-pool surface is
> `personal_files` + the owner's Moodle imports. Keep the policies (cheap,
> correct) but build UX (§8) around `personal_files` + Moodle, not
> `course_materials`.

**`personal_files`** — identical four-policy treatment (member SELECT;
contributor INSERT; owner-or-uploader UPDATE/DELETE). **This is the table that
matters in practice.**

**`documents`** — **unchanged.** Stays `auth.uid() = user_id`. This is the
mechanism that keeps personal notes private inside a shared course: a member's
note carries the shared `course_id` but is only ever selectable by its author.

**`course_members`**:

```sql
alter table public.course_members enable row level security;

-- Read: members can see the roster of courses they belong to
create policy "Members can view course roster"
  on public.course_members for select
  using (public.is_course_member(course_id));

-- Insert: handled by join_course_via_link() (SECURITY DEFINER, §7.1); also
-- allow a user to insert their OWN membership row (defense for the RPC):
create policy "Users can insert own membership"
  on public.course_members for insert
  with check (user_id = auth.uid());

-- Update/Delete: owner manages roles + removals; a member may remove themself
create policy "Owner manages membership"
  on public.course_members for update
  using (public.is_course_owner(course_id));
create policy "Owner or self can remove membership"
  on public.course_members for delete
  using (public.is_course_owner(course_id) or user_id = auth.uid());
```

**`course_share_links`** — owner-only manage; the join flow reads the token via
a `SECURITY DEFINER` RPC, so joiners need no table-wide SELECT:

```sql
alter table public.course_share_links enable row level security;
create policy "Owner manages share links"
  on public.course_share_links for all
  using (public.is_course_owner(course_id))
  with check (public.is_course_owner(course_id));
```

### 6.3 Storage (`course-materials` + `personal-files` buckets)

Signed URLs are generated **client-side** (`material-item.tsx:51`,
`personal-file-item.tsx:50`), so member reads must be allowed by storage RLS
itself. The stored `storage_path` equals the storage object key
(`storage.objects.name`) — confirmed by the existing per-user policy working
with `createSignedUrl(storage_path)` and `(storage.foldername(name))[1]` — so
the join `cm.storage_path = name` is valid. Object paths are `{owner_id}/{file}`
and don't encode the course, so the policy joins through the materials table by
`storage_path`:

```sql
-- course-materials: members can read any object backing a material in a
-- course they belong to (existing owner-path SELECT policy stays).
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

-- personal-files: same pattern against public.personal_files.
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

The `moodle-materials` bucket is already authenticated-read, so the owner's
Moodle files are reachable by members with no storage change.

INSERT into storage stays per-user-path (a contributor uploads under their own
`{user_id}/…` prefix), which the existing INSERT policy already allows.

Notes: (a) historical `course_materials` rows can carry a `moodle:`-prefixed
`storage_path` (`material-item.tsx:43`) that is **not** a `course-materials`
object key — the join is simply inert for those (they're served from
`moodle-materials`); (b) the policy subquery runs per object read, so consider
adding an index on `personal_files.storage_path` (and `course_materials.
storage_path`) if material lists grow large — signed-URL generation is one-off
per open, so this is low priority.

### 6.4 Embeddings & RAG

`content_embeddings` RLS today is `user_id = auth.uid() OR user_id IS NULL`, so
a member cannot read another member's `course_material`/`personal_file`
embeddings. Add a member-read policy:

```sql
create policy "Members can read shared course embeddings"
  on public.content_embeddings for select
  using (
    source_type in ('course_material', 'personal_file')
    and public.is_course_member(course_id)
  );
```

(Moodle embeddings have `user_id IS NULL` and `course_id = moodle_courses.id`;
they remain **globally readable by any authenticated user** via the existing
`"Users can view own and shared embeddings"` policy — unchanged, pre-existing
behavior — and are gated only by the whitelist param. So the privacy guarantee
"a member can't read another's embeddings" applies to the _owned_ types
(`course_material` / `personal_file`), not to the globally-shared Moodle rows.)

`match_embeddings` (currently `LANGUAGE sql STABLE`, SECURITY INVOKER — runs
under the caller's RLS) today has user-id filters in **three** positions
(`20260525120000:80-91`) that must all be relaxed: the outer
`(ce.user_id = match_user_id OR ce.user_id IS NULL)` guard, **and** the
`ce.user_id = match_user_id` clause on **both** the `course_material` branch and
the `personal_file` branch. All three are removed so the function scopes purely
by `course_id` / the Moodle whitelist, and **RLS becomes the sole access gate**:

```sql
-- (outer ce.user_id guard removed entirely — RLS handles visibility)
where (
    -- course_material / personal_file: course-scoped, any member's upload
    (ce.source_type in ('course_material', 'personal_file')
      and match_course_id is not null
      and ce.course_id = match_course_id)
    or
    -- moodle_file: owner's import whitelist (resolved in searchContext, §7.4)
    (ce.source_type = 'moodle_file'
      and match_moodle_course_id is not null
      and ce.course_id = match_moodle_course_id
      and (match_imported_moodle_file_ids is null
           or ce.source_id = any(match_imported_moodle_file_ids)))
  )
  and 1 - (ce.embedding <=> query_embedding) > similarity_threshold
```

The function stays INVOKER (no `SECURITY DEFINER`), `LANGUAGE sql STABLE`, and
its signature is unchanged. Correctness now depends on the new
`content_embeddings` member-SELECT policy above; without it a member's query
would (correctly) return only their own rows. Both pieces ship in the same
migration. The `match_user_id` parameter is retained for signature stability
but no longer filters.

## 7. Server actions & code changes

### 7.1 Sharing actions — `src/lib/actions/course-sharing.ts` (new)

```ts
// Owner-only (RLS enforces is_course_owner on course_share_links):
createOrUpdateShareLink({ courseId, role }): { token }   // upsert active link
deactivateShareLink({ courseId, role })
regenerateShareLink({ courseId, role }): { token }        // deactivate + insert
listMembers(courseId): Member[]                           // roster + roles
updateMemberRole({ courseId, userId, role })

// Membership removal (see §7.5b for the shared removeMembership routine):
leaveCourse(courseId)            // member self-leave ("Remove from my list")
removeMember({ courseId, userId })  // owner removes a member
```

### 7.2 Join flow — `join_course_via_link(p_token)` RPC + route

`SECURITY DEFINER` RPC validates the link is active, resolves `course_id` +
`role`, and inserts a `course_members` row idempotently — no-op if the caller is
the owner or already a member. Returns the `course_id` to redirect to.

```sql
create or replace function public.join_course_via_link(p_token text)
returns uuid
language plpgsql security definer set search_path = public, pg_temp
as $$
declare v_course_id uuid; v_role text; v_uid uuid := auth.uid();
begin
  if v_uid is null then raise exception 'unauthenticated'; end if;
  select course_id, role into v_course_id, v_role
    from public.course_share_links
    where token = p_token and is_active limit 1;
  if v_course_id is null then raise exception 'invalid_or_inactive_link'; end if;
  -- owner already has full access; do nothing
  if exists (select 1 from public.courses where id = v_course_id and user_id = v_uid)
    then return v_course_id; end if;
  insert into public.course_members (course_id, user_id, role)
    values (v_course_id, v_uid, v_role)
    on conflict (course_id, user_id) do nothing;  -- idempotent
  return v_course_id;
end;
$$;
```

Route: `src/app/(dashboard)/share/[token]/page.tsx` (server component) — if not
authenticated, redirect to `/login?next=/share/{token}`; else call the RPC and
`redirect('/dashboard/courses/' + courseId)`.

### 7.3 Open + upload + delete actions

**Open (BLOCKER to fix).** Both "open a file as a document" actions hard-block
non-owners and will throw "not found" for every member clicking a file someone
else uploaded:

- `openMaterialAsDocument` — `if (material.user_id !== user.id) throw ...`
  (`documents.ts:208`)
- `openPersonalFileAsDocument` — `if (file.user_id !== user.id) throw ...`
  (`personal-files.ts:76`)

Replace each ownership check with an `is_course_member(course_id)` check (call
the RPC, or rely on the now-member-visible row + a membership guard). The newly
created `documents` row is already stamped with the **caller's** `user_id`, and
the per-user unique indexes `documents_material_user_idx` /
`documents_personal_file_user_idx` are `(file_id, user_id)`-keyed — so two
members each opening the same shared file get independent private doc rows with
no collision. This is what makes Viewer access actually usable.

**Upload — no signature change.** `createCourseMaterial` / `createPersonalFile`
already insert with `user_id = self` and delegate authorization to RLS, so the
tightened INSERT policy is sufficient: a viewer's upload fails at the DB. UI
gates the controls (§8.2). Add `revalidatePath('/dashboard/courses/' +
courseId)` so members see updates.

**Delete — no signature change, but UI must gate (§8.2).**
`deleteCourseMaterial` / `deletePersonalFile` filter `.eq('user_id', user.id)`
then `.single()`; the new DELETE policy lets the owner delete any file. A member
clicking delete on another's file fails the `.single()` → ugly toast, so the
delete button is gated in the UI to owner-or-uploader.

### 7.4 RAG read path for members — `searchContext` / `buildAiContext`

(`src/lib/actions/ai-context.ts`)

For a member viewing a shared course, the existing per-user resolution of
`moodle_course_id` + imported file ids (via the caller's `user_course_syncs` /
`user_file_imports`) returns nothing. Change it to resolve the **course's
canonical Moodle view from the owner**:

- Add `course_moodle_view(p_course_id)` `SECURITY DEFINER` helper returning the
  owner's `moodle_course_id` and the array of the owner's imported
  `moodle_file_id`s for that course. Guard: only returns data if
  `is_course_member(p_course_id)`.
- `searchContext` calls this helper (instead of reading the caller's own sync)
  when building `moodleCourseId` + `importedMoodleFileIds`. For non-shared
  courses owned by the caller, the result is identical to today.
- **BLOCKER — the Moodle _display_ path needs the same fix.**
  `getMoodleMaterialsForCourse` (`moodle-materials.ts:28`) resolves the
  **caller's** `user_course_syncs` (`.eq('user_id', user.id)`), so a member sees
  `[]` and the owner's Moodle files never appear in the list. Route it through
  the same `course_moodle_view` helper (gated by `is_course_member`) so the
  owner's imported Moodle files render for members. It already uses the admin
  client for the registry reads, so only the sync/whitelist resolution changes.

`course_material` / `personal_file` embeddings need no whitelist — RLS +
`match_course_id` handle them.

### 7.5 Deletion & departure — two distinct operations

There are **two** separate operations, and only the owner can delete:

#### 7.5a Owner deletes the course — `deleteCourse` (`courses.ts:62`)

Only the owner can delete (the action's final `.delete().eq('user_id',
user.id)` already enforces this). The current implementation uses the
**request-scoped** client, queries only `course_materials` filtered by
`.eq('user_id', user.id)`, removes only the `course-materials` bucket, and
deletes embeddings explicitly per material. That is insufficient for shared
courses, and **embeddings do not cascade** — the `content_embeddings.course_id`
FK was dropped in `20260522123000:30` (now a polymorphic, FK-less column). The
rewrite must:

1. Use the **admin (service-role) client** (contributors' files/objects live
   under their own user prefix, unreachable via the owner's per-user storage
   RLS).
2. Enumerate **both** `course_materials` and `personal_files` by `course_id`
   (drop the `user_id` filter — these are now all members' rows).
3. Delete embeddings **explicitly** for every `course_material` and
   `personal_file` (`deleteEmbeddingsBySource(...)`) — there is no cascade.
4. Remove storage objects from **both** the `course-materials` and
   `personal-files` buckets.
5. Delete the course row. DB cascades `course_members`, `course_share_links`,
   and `homework_sessions` / `ai_conversations`; the `documents.course_id` FK
   (now `set null`, §5.3) means **every member's private notes survive as
   unfiled documents** — confirmed desired behavior.

#### 7.5b Member leaves / owner removes a member — `removeMembership` (new)

Members never delete a shared course; they **"Remove from my list."** A single
routine `removeMembership(courseId, targetUserId)` serves both self-leave
(`targetUserId = self`) and owner-initiated removal. The course and everyone
else's access are untouched ("if someone shared it, they still can access").
For the target user it:

1. Deletes the target's **own contributed files** in the course — rows in
   `course_materials` / `personal_files` where `user_id = targetUserId AND
course_id = courseId` — plus their storage objects and embeddings.
2. **Unfiles the target's private notes**, not delete them: `update documents
set course_id = null where user_id = targetUserId and course_id = courseId`.
   (On owner-delete this happens via the FK; on leave the course still exists,
   so it's an explicit `UPDATE`.) Their notes reappear at the dashboard root.
3. Deletes the `course_members` row.

Uses the **admin client** so it works when the owner removes a _different_
user's files/notes (per-user RLS would otherwise block cross-user writes); for
self-leave it operates only on the caller's own rows. Authorization:
self-leave allowed for any member; owner-removal requires `is_course_owner`.

> **Decision to confirm:** this treats owner-removing-a-member symmetrically
> with self-leave — the removed member's contributed files are deleted. If you'd
> rather owner-removal _keep_ those files in the pool (only revoke access), say
> so and we'll branch the two paths.

### 7.6 Dashboard & course page

- **Existing course-list queries leak shared courses (BLOCKER).** Today these
  rely on RLS to scope to the owner and do **not** filter by `user_id`; once the
  `courses` member-SELECT policy lands they will also return shared courses,
  dumping them into the owner's own sections. Add `.eq('user_id', user.id)` to:
  - `dashboard/page.tsx:51` (root courses),
  - `getCoursesByFolder` (`src/lib/queries/courses.ts:6`),
  - `folders/[folderId]/page.tsx:49`.
    (Mutation paths in `courses.ts` / `homework.ts` already `.eq('user_id', …)`.)
- **Dashboard "Shared with me":** add a query selecting via `course_members`
  (join to `courses`) for courses where the user is a member, rendered in a
  separate **"Shared with me"** section using `CourseCard` with a shared badge +
  owner name.
- **Course page** (`…/courses/[courseId]/page.tsx`): RLS-scoped, so a member load
  returns the shared materials and the member's own documents. The existing
  "hide personal files that have a linked document" logic is per-user-correct
  (filters by the current user's `documents`, already RLS-restricted). Add
  role-aware rendering (§8.2) and route Moodle through §7.4's display fix.

## 8. UX

### 8.1 Owner — Share dialog

A "Share" button in the course header opens a dialog: a sharing toggle; role
selector for the link (Viewer / Contributor) with copyable URL
`…/share/{token}`; a **member list** with each person's role; controls to
**change role**, **remove member**, and **deactivate / regenerate** the link.
Owner-only (hidden for members).

### 8.2 Member — course page & "Shared with me" card

- Sees the full shared material pool (optionally with uploader attribution).
- Sees only their **own** private documents in the course.
- Upload / "Import File" controls render only for **owner + contributor**;
  hidden for viewers.
- **Per-file action buttons gated.** The Delete button in `MaterialItem` /
  `PersonalFileItem` is hardcoded today; pass a `canManage` prop
  (`isOwner || uploaderId === currentUserId`) and render Delete only when true.
  Opening a file works for any member via §7.3's fix.
- **No "Delete course" for members — instead "Remove from my list."** On the
  member's `CourseCard` (in "Shared with me") and/or course header, the
  destructive action is **Remove from my list**, calling `leaveCourse`. The
  confirm dialog explains: _"This removes the course from your list and deletes
  the files you added to it. Your own notes are kept (moved to your home)."_
- No course edit, no Share dialog.
- Header shows "Shared by {owner display name}".

### 8.3 Recipient — opening a link

Open `…/share/{token}` → (sign in if needed) → membership created → redirected
into the course. Reopening is a harmless no-op.

## 9. Lifecycle & edge cases

| Event                                 | Behavior                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Owner deletes course                  | `course_members` + `course_share_links` cascade; `documents.course_id` → `null` (notes survive as unfiled); all members' contributed files + storage objects removed and their embeddings **explicitly deleted** (no cascade — §7.5). **Data loss to flag:** every member's `homework_sessions` and `ai_conversations` for the course are `ON DELETE CASCADE` (`20260523172415:13`, `00017:32`) and are destroyed — a member's homework _document_ survives (course_id→null) but its session linkage is gone. |
| Member leaves ("Remove from my list") | `removeMembership(courseId, self)` (§7.5b): deletes the member's own contributed files (+storage +embeddings), **unfiles** their private notes (`documents.course_id → null`), removes the `course_members` row. Course + everyone else's access untouched. Re-joinable if the link is still active.                                                                                                                                                                                                          |
| Owner removes a member                | `removeMembership(courseId, member)` (admin client): same effect on that member's files/notes; access revoked immediately. (Decision flagged in §7.5b — could instead keep the files.)                                                                                                                                                                                                                                                                                                                        |
| Link deactivated / regenerated        | existing members keep access; only new joins via the old token are blocked.                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| Role downgrade (contributor→viewer)   | can no longer upload; already-added files stay.                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| Join guards                           | can't join your own course (no-op); double-join is a no-op (`on conflict`); inactive/invalid token → error page with a friendly message.                                                                                                                                                                                                                                                                                                                                                                      |
| Owner                                 | implicit, cannot be removed and cannot "leave"; the owner's destructive action is **Delete course** (§7.5a).                                                                                                                                                                                                                                                                                                                                                                                                  |

## 10. Backwards compatibility & migration safety

- **New tables** (`course_members`, `course_share_links`) — additive.
- **`documents.course_id`** FK swaps `cascade` → `set null`. Behavior change:
  deleting a course no longer deletes the owner's notes in it (they become
  unfiled). Considered an improvement; called out for the user.
- **RLS** — owner paths preserved; member paths added; INSERT tightened on
  `course_materials` / `personal_files`. Existing single-user behavior is
  unchanged for a course with no members.
- **`match_embeddings`** — signature unchanged; body relaxes the shared-course
  branch. Only `searchContext` calls it (no external consumers). Rollback =
  revert the migration; resurrecting the prior body is a small inverse
  migration (prior text preserved in `20260525120000` / `20260522123000`
  history).
- **Storage policies** — added, not modified; owner-path policies intact.

## 11. Test plan

Per project policy: unit + integration (Vitest) and **E2E (Playwright)** with
the shared `auth.ts` helper, all green before "done".

### Unit / integration (against local Supabase)

- `is_course_member` / `is_course_contributor` / `is_course_owner` return
  correct booleans for owner, viewer, contributor, non-member.
- RLS matrix on `course_materials` / `personal_files`:
  - member can SELECT; non-member cannot.
  - viewer INSERT denied; contributor INSERT allowed; non-member INSERT denied.
  - DELETE/UPDATE = owner (any) or uploader (own); others denied.
- `documents` remain invisible to other members of the same shared course.
- `join_course_via_link`: valid active token creates membership with the link's
  role; idempotent on re-join; owner self-join is a no-op; inactive/invalid
  token raises.
- Embeddings: a member's `match_embeddings` for the shared course returns files
  uploaded by _other_ members; never returns any `documents` (none are
  embedded) and never another course's rows.
- `course_moodle_view` returns the owner's sync + imports to a member, and
  `null`/empty to a non-member.
- `deleteCourse` removes contributors' storage objects (admin client) and the
  FK leaves member notes' `course_id` null (notes survive) rather than deleting
  them.
- `removeMembership` (self-leave and owner-removal): deletes the target's
  contributed files + embeddings, sets the target's `documents.course_id` to
  null (notes kept), removes the `course_members` row, and leaves the course +
  other members untouched. Owner-removal of a non-member / by a non-owner is
  rejected.

### E2E (Playwright, two seeded users)

Use `test@typenote.dev` (owner) and `test-b@typenote.dev` (recipient). Add a
`loginAs(page, email, password)` helper to `e2e/helpers/auth.ts` (no duplicated
login code).

1. **Contribute flow:** owner creates course + uploads a material → opens Share,
   picks **Contributor**, copies link → log in as B, open link → B lands in the
   course, sees the material → B uploads a file → owner reloads, sees B's file.
2. **Viewer flow:** owner shares a **Viewer** link → B joins → B sees materials
   but the upload/import controls are absent.
3. **Revoke:** owner removes B → B can no longer open the course.
4. **Privacy:** B creates a note inside the shared course → owner does **not**
   see it anywhere.
5. **AI:** B opens AI chat in the shared course and asks about a file the
   **owner** uploaded → the answer cites that file. (Depends on §7.4 — both the
   RAG read path **and** the Moodle display path being fixed.)
6. **Leave ("Remove from my list"):** B joins as Contributor, uploads a file,
   writes a note → B chooses "Remove from my list" → B's note appears at their
   dashboard root (unfiled); the course is gone from B's "Shared with me"; the
   owner reloads and B's uploaded file is gone, the course still exists.

Add an explicit **open-and-read** assertion to scenario 1/2 (B clicks a file the
owner uploaded and it opens as a document) — this exercises the §7.3 BLOCKER
fix, without which Viewer access is non-functional.

Update `e2e/TEST_REGISTRY.md` with these scenarios.

## 12. Out-of-scope follow-ups

- Contributors contributing their **own Moodle imports** to the shared pool
  (union the per-user whitelist across members).
- Email/targeted invites and an in-app notification when someone joins.
- Per-link expiry, max-uses, and a "require approval to join" mode.
- "Shared with me" surfacing of orphaned notes after a member leaves.
- The deferred sibling features: NotebookLM-style study artifacts; materials-UX
  redesign.
