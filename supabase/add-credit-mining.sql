-- Credit Mining migration for existing databases
-- Run this once in Supabase SQL Editor.

begin;

alter table public.profiles
  add column if not exists last_login_bonus_date date;

alter table public.credit_transactions
  drop constraint if exists credit_transactions_type_check;

alter table public.credit_transactions
  add constraint credit_transactions_type_check
  check (type in ('assign', 'bid_deduct', 'bid_refund', 'winner_deduct', 'mining'));

commit;
