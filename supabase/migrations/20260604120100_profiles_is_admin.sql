-- Admin authorization flag. Authentication stays Supabase Auth (single identity);
-- this flag is the authorization gate for the /admin area. Default false so no
-- existing user becomes an admin implicitly.
ALTER TABLE public.profiles
  ADD COLUMN is_admin boolean NOT NULL DEFAULT false;
