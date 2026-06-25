-- Taste Engine Schema
-- Run this in the Supabase SQL Editor

-- Users table
create table if not exists users (
  id uuid primary key default gen_random_uuid(),
  wallet_address text,
  total_earned_usdc numeric(12,6) default 0,
  vote_count integer default 0,
  created_at timestamptz default now()
);

-- Items table
create table if not exists items (
  id text primary key,
  name text not null,
  sub text,
  cat text,
  img text,
  rating integer default 1200,
  comparisons integer default 0,
  wins integer default 0,
  created_at timestamptz default now()
);

-- Campaigns table
create table if not exists campaigns (
  id uuid primary key default gen_random_uuid(),
  brand_name text not null,
  title text not null,
  status text default 'active' check (status in ('active', 'paused', 'completed')),
  budget_usdc numeric(12,6) default 0,
  spent_usdc numeric(12,6) default 0,
  payout_per_vote numeric(12,6) default 0.05,
  injection_rate numeric(3,2) default 0.30,
  ends_at timestamptz,
  created_at timestamptz default now()
);

-- Campaign items junction
create table if not exists campaign_items (
  campaign_id uuid references campaigns(id) on delete cascade,
  item_id text references items(id) on delete cascade,
  primary key (campaign_id, item_id)
);

-- Votes table
create table if not exists votes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references users(id),
  winner_id text not null,
  loser_id text not null,
  campaign_id uuid references campaigns(id),
  quality_score numeric(4,3) default 1.0,
  time_taken_ms integer,
  session_id text,
  source text default 'human' check (source in ('human', 'agent')),
  created_at timestamptz default now()
);

-- Payouts table
create table if not exists payouts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references users(id),
  amount_usdc numeric(12,6) not null,
  status text default 'pending' check (status in ('pending', 'processing', 'completed', 'failed')),
  tx_hash text,
  created_at timestamptz default now()
);

-- Agents table (for x402)
create table if not exists agents (
  id uuid primary key default gen_random_uuid(),
  agent_id_hash text unique not null,
  total_votes integer default 0,
  total_paid_usdc numeric(12,6) default 0,
  created_at timestamptz default now()
);

-- Add source tracking for server-refreshed trending items
alter table items add column if not exists source text default 'seed';
alter table items add column if not exists refreshed_at timestamptz;

-- Indexes
create index if not exists idx_votes_user on votes(user_id);
create index if not exists idx_votes_campaign on votes(campaign_id);
create index if not exists idx_votes_session on votes(session_id);
create index if not exists idx_campaigns_status on campaigns(status);
create index if not exists idx_items_cat on items(cat);
create index if not exists idx_items_source on items(source);
create index if not exists idx_items_refreshed on items(refreshed_at);

-- Row Level Security
alter table users enable row level security;
alter table items enable row level security;
alter table campaigns enable row level security;
alter table votes enable row level security;
alter table payouts enable row level security;

-- Public read/write for items and campaigns
create policy "Items are publicly readable" on items for select using (true);
create policy "Items are publicly insertable" on items for insert with check (true);
create policy "Items are publicly updatable" on items for update using (true);
create policy "Campaigns are publicly readable" on campaigns for select using (true);
create policy "Campaign items are publicly readable" on campaign_items for select using (true);

-- Users can read/insert/update their own data
create policy "Users read own data" on users for select using (auth.uid() = id);
create policy "Users can insert own row" on users for insert with check (auth.uid() = id);
create policy "Users update own data" on users for update using (auth.uid() = id);

-- Votes insertable by authenticated users
create policy "Authenticated users can insert votes" on votes for insert with check (auth.uid() is not null);
create policy "Votes are publicly readable" on votes for select using (true);

-- Payouts readable by own user
create policy "Users read own payouts" on payouts for select using (auth.uid() = user_id);
create policy "Users can request payouts" on payouts for insert with check (auth.uid() = user_id);

-- Service role can do everything (for edge functions)
-- Already handled by Supabase default service role

-- ══════════════════════════════════════════════════════════════════
-- Daily trending refresh via pg_cron
-- Run this AFTER enabling the pg_cron extension in Supabase Dashboard:
--   Dashboard → Database → Extensions → search "pg_cron" → Enable
-- ══════════════════════════════════════════════════════════════════

-- Enable pg_cron (if not already)
-- create extension if not exists pg_cron;

-- Schedule daily at 11:00 AM UTC
-- This calls the refresh-trending edge function via HTTP
select cron.schedule(
  'daily-trending-refresh',     -- job name
  '0 11 * * *',                 -- 11:00 AM UTC every day
  $$
  select net.http_post(
    url := current_setting('app.settings.supabase_url') || '/functions/v1/refresh-trending',
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key'),
      'Content-Type', 'application/json'
    ),
    body := '{}'::jsonb
  );
  $$
);

-- To check scheduled jobs:
--   select * from cron.job;
-- To see job run history:
--   select * from cron.job_run_details order by start_time desc limit 10;
-- To remove the job:
--   select cron.unschedule('daily-trending-refresh');
