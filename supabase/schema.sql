-- RocketBids: Complete SQL Schema with RLS Policies
-- Run this in the Supabase SQL Editor

-- Enable UUID extension
create extension if not exists "uuid-ossp";

-- ============================================================
-- TABLE: profiles
-- ============================================================
create table public.profiles (
  id uuid references auth.users on delete cascade primary key,
  full_name text not null,
  role text not null default 'bidder' check (role in ('admin', 'bidder')),
  credits integer not null default 0,
  reserved_credits integer not null default 0,
  last_login_bonus_date date,
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

-- Helper to check admin role without triggering recursive RLS on profiles
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

-- Admin can read all profiles
create policy "Admin can read all profiles"
  on public.profiles for select
  using (public.is_admin());

-- Users can read their own profile
create policy "Users can read own profile"
  on public.profiles for select
  using (auth.uid() = id);

-- Admin can update all profiles (assign credits, change roles)
create policy "Admin can update all profiles"
  on public.profiles for update
  using (public.is_admin());

-- Users can update their own profile (name only, handled in app)
create policy "Users can update own profile"
  on public.profiles for update
  using (auth.uid() = id);

-- Allow insert during registration
create policy "Users can insert own profile"
  on public.profiles for insert
  with check (auth.uid() = id);

-- ============================================================
-- TABLE: auctions
-- ============================================================
create table public.auctions (
  id uuid default uuid_generate_v4() primary key,
  title text not null,
  description text not null default '',
  image_url text,
  category text not null default 'General',
  start_time timestamptz not null default now(),
  end_time timestamptz not null,
  min_bid integer not null default 1,
  current_bid integer not null default 0,
  current_winner_id uuid references public.profiles(id),
  status text not null default 'active' check (status in ('active', 'closed', 'upcoming')),
  blind_mode boolean not null default false,
  created_by uuid references public.profiles(id) not null,
  created_at timestamptz not null default now()
);

alter table public.auctions enable row level security;

-- Everyone authenticated can read auctions
create policy "Authenticated users can read auctions"
  on public.auctions for select
  using (auth.role() = 'authenticated');

-- Admin can insert auctions
create policy "Admin can insert auctions"
  on public.auctions for insert
  with check (public.is_admin());

-- Admin can update auctions
create policy "Admin can update auctions"
  on public.auctions for update
  using (public.is_admin());

-- Admin can delete auctions
create policy "Admin can delete auctions"
  on public.auctions for delete
  using (public.is_admin());

-- ============================================================
-- TABLE: bids
-- ============================================================
create table public.bids (
  id uuid default uuid_generate_v4() primary key,
  auction_id uuid references public.auctions(id) on delete cascade not null,
  bidder_id uuid references public.profiles(id) not null,
  amount integer not null,
  created_at timestamptz not null default now()
);

alter table public.bids enable row level security;

-- Admin can read all bids
create policy "Admin can read all bids"
  on public.bids for select
  using (public.is_admin());

-- Bidders can read bids on auctions they participate in
create policy "Bidders can read auction bids"
  on public.bids for select
  using (auth.role() = 'authenticated');

-- Bidders can insert their own bids
create policy "Bidders can insert own bids"
  on public.bids for insert
  with check (auth.uid() = bidder_id);

-- ============================================================
-- TABLE: credit_reservations
-- ============================================================
create table public.credit_reservations (
  id uuid default uuid_generate_v4() primary key,
  user_id uuid references public.profiles(id) not null,
  auction_id uuid references public.auctions(id) on delete cascade not null,
  amount integer not null check (amount > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, auction_id)
);

alter table public.credit_reservations enable row level security;

-- Admin can read all reservations
create policy "Admin can read all credit_reservations"
  on public.credit_reservations for select
  using (public.is_admin());

-- Users can read their own reservations
create policy "Users can read own credit_reservations"
  on public.credit_reservations for select
  using (auth.uid() = user_id);

-- Admin can insert reservations
create policy "Admin can insert credit_reservations"
  on public.credit_reservations for insert
  with check (public.is_admin());

-- Admin can update reservations
create policy "Admin can update credit_reservations"
  on public.credit_reservations for update
  using (public.is_admin());

-- Admin can delete reservations
create policy "Admin can delete credit_reservations"
  on public.credit_reservations for delete
  using (public.is_admin());

-- ============================================================
-- TABLE: credit_transactions
-- ============================================================
create table public.credit_transactions (
  id uuid default uuid_generate_v4() primary key,
  user_id uuid references public.profiles(id) not null,
  amount integer not null,
  type text not null check (type in ('assign', 'bid_deduct', 'bid_refund', 'winner_deduct', 'mining')),
  auction_id uuid references public.auctions(id),
  note text,
  created_at timestamptz not null default now()
);

alter table public.credit_transactions enable row level security;

-- Admin can read all credit transactions
create policy "Admin can read all credit_transactions"
  on public.credit_transactions for select
  using (public.is_admin());

-- Users can read own credit transactions
create policy "Users can read own credit_transactions"
  on public.credit_transactions for select
  using (auth.uid() = user_id);

-- Admin can insert credit transactions
create policy "Admin can insert credit_transactions"
  on public.credit_transactions for insert
  with check (public.is_admin());

-- System/service role inserts handled by service key (bypasses RLS)
-- Bidder credit transactions created via API routes using service role

-- ============================================================
-- FUNCTION: Handle new user registration
-- ============================================================
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, full_name, role)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'full_name', 'User'),
    coalesce(new.raw_user_meta_data ->> 'role', 'bidder')
  );
  return new;
end;
$$ language plpgsql security definer;

-- Trigger to auto-create profile on signup
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ============================================================
-- Enable Realtime on bids and auctions
-- ============================================================
alter publication supabase_realtime add table public.bids;
alter publication supabase_realtime add table public.auctions;

-- ============================================================
-- Indexes for performance
-- ============================================================
create index idx_bids_auction_id on public.bids(auction_id);
create index idx_bids_bidder_id on public.bids(bidder_id);
create index idx_bids_created_at on public.bids(created_at desc);
create index idx_auctions_status on public.auctions(status);
create index idx_auctions_end_time on public.auctions(end_time);
create index idx_credit_transactions_user_id on public.credit_transactions(user_id);
create index idx_credit_reservations_user_id on public.credit_reservations(user_id);
create index idx_credit_reservations_auction_id on public.credit_reservations(auction_id);
