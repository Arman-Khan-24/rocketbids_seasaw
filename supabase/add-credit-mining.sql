-- Credit Mining migration for existing databases
-- Run this once in Supabase SQL Editor.

begin;

create extension if not exists "uuid-ossp";

alter table public.profiles
  add column if not exists last_login_bonus_date date;

alter table public.profiles
  add column if not exists reserved_credits integer not null default 0;

create table if not exists public.credit_reservations (
  id uuid default uuid_generate_v4() primary key,
  user_id uuid references public.profiles(id) not null,
  auction_id uuid references public.auctions(id) on delete cascade not null,
  amount integer not null check (amount > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, auction_id)
);

alter table public.credit_reservations enable row level security;

drop policy if exists "Admin can read all credit_reservations" on public.credit_reservations;
drop policy if exists "Users can read own credit_reservations" on public.credit_reservations;
drop policy if exists "Admin can insert credit_reservations" on public.credit_reservations;
drop policy if exists "Admin can update credit_reservations" on public.credit_reservations;
drop policy if exists "Admin can delete credit_reservations" on public.credit_reservations;

create policy "Admin can read all credit_reservations"
  on public.credit_reservations for select
  using (public.is_admin());

create policy "Users can read own credit_reservations"
  on public.credit_reservations for select
  using (auth.uid() = user_id);

create policy "Admin can insert credit_reservations"
  on public.credit_reservations for insert
  with check (public.is_admin());

create policy "Admin can update credit_reservations"
  on public.credit_reservations for update
  using (public.is_admin());

create policy "Admin can delete credit_reservations"
  on public.credit_reservations for delete
  using (public.is_admin());

create index if not exists idx_credit_reservations_user_id on public.credit_reservations(user_id);
create index if not exists idx_credit_reservations_auction_id on public.credit_reservations(auction_id);

alter table public.credit_transactions
  drop constraint if exists credit_transactions_type_check;

alter table public.credit_transactions
  add constraint credit_transactions_type_check
  check (type in ('assign', 'bid_deduct', 'bid_refund', 'winner_deduct', 'mining'));

-- Sniper flag: set true at bid insert time when bid lands in last 60s of auction
alter table public.bids
  add column if not exists is_snipe boolean not null default false;

commit;
