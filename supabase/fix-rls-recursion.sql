-- Fix RLS recursion for profiles/admin checks
-- Run this once in Supabase SQL Editor for existing projects.

begin;

create or replace function public.is_admin()
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles
    where id = auth.uid() and role = 'admin'
  );
$$;

revoke all on function public.is_admin() from public;
grant execute on function public.is_admin() to authenticated, anon, service_role;

-- Rebuild profiles policies without self-referencing subqueries

drop policy if exists "Admin can read all profiles" on public.profiles;
drop policy if exists "Users can read own profile" on public.profiles;
drop policy if exists "Admin can update all profiles" on public.profiles;
drop policy if exists "Users can update own profile" on public.profiles;
drop policy if exists "Users can insert own profile" on public.profiles;

create policy "Admin can read all profiles"
  on public.profiles for select
  using (public.is_admin());

create policy "Users can read own profile"
  on public.profiles for select
  using (auth.uid() = id);

create policy "Admin can update all profiles"
  on public.profiles for update
  using (public.is_admin());

create policy "Users can update own profile"
  on public.profiles for update
  using (auth.uid() = id);

create policy "Users can insert own profile"
  on public.profiles for insert
  with check (auth.uid() = id);

-- Rebuild dependent admin policies that currently query profiles directly

drop policy if exists "Admin can insert auctions" on public.auctions;
drop policy if exists "Admin can update auctions" on public.auctions;
drop policy if exists "Admin can delete auctions" on public.auctions;

create policy "Admin can insert auctions"
  on public.auctions for insert
  with check (public.is_admin());

create policy "Admin can update auctions"
  on public.auctions for update
  using (public.is_admin());

create policy "Admin can delete auctions"
  on public.auctions for delete
  using (public.is_admin());

drop policy if exists "Admin can read all bids" on public.bids;
create policy "Admin can read all bids"
  on public.bids for select
  using (public.is_admin());

drop policy if exists "Admin can read all credit_transactions" on public.credit_transactions;
drop policy if exists "Admin can insert credit_transactions" on public.credit_transactions;

create policy "Admin can read all credit_transactions"
  on public.credit_transactions for select
  using (public.is_admin());

create policy "Admin can insert credit_transactions"
  on public.credit_transactions for insert
  with check (public.is_admin());

-- Backfill missing profiles for users created before trigger/policies were in place
insert into public.profiles (id, full_name, role, credits, created_at)
select
  u.id,
  coalesce(u.raw_user_meta_data ->> 'full_name', split_part(coalesce(u.email, 'user@example.com'), '@', 1), 'User'),
  case
    when coalesce(u.raw_user_meta_data ->> 'role', 'bidder') = 'admin' then 'admin'
    else 'bidder'
  end,
  0,
  now()
from auth.users u
left join public.profiles p on p.id = u.id
where p.id is null;

-- Optional: force invalid role values back to bidder
update public.profiles
set role = 'bidder'
where role not in ('admin', 'bidder');

commit;

-- If your account should be admin but is still bidder, run:
-- update public.profiles p
-- set role = 'admin'
-- from auth.users u
-- where p.id = u.id
--   and u.email = 'your-admin-email@example.com';
