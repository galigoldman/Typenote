-- ============================================
-- Context Cache Registry: tracks active Gemini
-- context caches for shared use across students.
-- Caches are per course-week, shared via API key.
-- ============================================

create table public.context_cache_registry (
  id uuid primary key default uuid_generate_v4(),
  course_id uuid not null references public.courses(id) on delete cascade,
  week_id uuid not null references public.course_weeks(id) on delete cascade,
  cache_name text not null,
  materials_hash text not null,
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  unique (course_id, week_id)
);

create index context_cache_registry_lookup_idx
  on public.context_cache_registry (course_id, week_id);

create index context_cache_registry_expiry_idx
  on public.context_cache_registry (expires_at);

-- RLS
alter table public.context_cache_registry enable row level security;

-- Any authenticated user can read (caches are shared)
create policy "Authenticated users can view cache registry"
  on public.context_cache_registry for select
  using (auth.role() = 'authenticated');

-- Only service role can write (controlled via server actions)
-- No INSERT/UPDATE/DELETE policies for regular users
