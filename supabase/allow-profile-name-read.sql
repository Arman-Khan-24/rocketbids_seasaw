-- Allow authenticated users to read bidder names for bid history joins.
-- Run this once in Supabase SQL Editor.

begin;

drop policy if exists "Authenticated users can read profile names" on public.profiles;
create policy "Authenticated users can read profile names"
  on public.profiles for select
  using (auth.role() = 'authenticated');

commit;
