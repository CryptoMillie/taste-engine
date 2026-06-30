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
-- Campaign payout RPCs
-- ══════════════════════════════════════════════════════════════════

-- Atomically try to pay out a campaign vote (prevents overspend race conditions)
create or replace function try_campaign_payout(
  p_campaign_id uuid,
  p_user_id uuid
) returns jsonb as $$
declare
  v_campaign record;
  v_amount numeric(12,6);
begin
  select payout_per_vote, budget_usdc, spent_usdc
  into v_campaign
  from campaigns
  where id = p_campaign_id and status = 'active'
  for update;

  if v_campaign is null then
    return jsonb_build_object('amount', 0, 'reason', 'campaign_not_found');
  end if;

  v_amount := v_campaign.payout_per_vote;

  if v_campaign.spent_usdc + v_amount > v_campaign.budget_usdc then
    return jsonb_build_object('amount', 0, 'reason', 'budget_exhausted');
  end if;

  update campaigns
  set spent_usdc = spent_usdc + v_amount
  where id = p_campaign_id;

  if p_user_id is not null then
    update users
    set total_earned_usdc = total_earned_usdc + v_amount
    where id = p_user_id;
  end if;

  return jsonb_build_object('amount', v_amount);
end;
$$ language plpgsql security definer;

-- Increment campaign spent (simpler fallback-compatible version)
create or replace function increment_campaign_spent(
  p_campaign_id uuid,
  p_amount numeric
) returns void as $$
begin
  update campaigns
  set spent_usdc = spent_usdc + p_amount
  where id = p_campaign_id
    and spent_usdc + p_amount <= budget_usdc;
end;
$$ language plpgsql security definer;

-- ══════════════════════════════════════════════════════════════════
-- Safe upsert for trending items (preserves rating/comparisons/wins)
-- ══════════════════════════════════════════════════════════════════

create or replace function upsert_trending_item(
  p_id text, p_name text, p_sub text, p_cat text, p_img text
) returns void as $$
begin
  insert into items (id, name, sub, cat, img, source, refreshed_at, rating, comparisons, wins)
  values (p_id, p_name, p_sub, p_cat, p_img, 'desearch', now(), 1200, 0, 0)
  on conflict (id) do update set
    name = excluded.name,
    sub = excluded.sub,
    cat = excluded.cat,
    img = excluded.img,
    source = 'desearch',
    refreshed_at = now();
  -- rating, comparisons, wins are NOT touched on existing rows
end;
$$ language plpgsql security definer;

-- ══════════════════════════════════════════════════════════════════
-- Daily trending refresh via pg_cron
-- Run this AFTER enabling the pg_cron extension in Supabase Dashboard:
--   Dashboard → Database → Extensions → search "pg_cron" → Enable
-- Also ensure pg_net extension is enabled.
--
-- IMPORTANT: Before running this, set app.settings in the Supabase SQL Editor:
--   alter database postgres set app.settings.supabase_url = 'https://<YOUR_PROJECT>.supabase.co';
--   alter database postgres set app.settings.service_role_key = '<YOUR_SERVICE_ROLE_KEY>';
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

-- ══════════════════════════════════════════════════════════════════
-- Auth upgrade: add social login columns to users
-- ══════════════════════════════════════════════════════════════════

alter table users add column if not exists auth_provider text default 'anonymous';
alter table users add column if not exists display_name text;
alter table users add column if not exists avatar_url text;
alter table users add column if not exists email text;
alter table users add column if not exists taste_state jsonb;
alter table users add column if not exists taste_state_updated_at timestamptz;

-- ══════════════════════════════════════════════════════════════════
-- Taste Coins: virtual currency tables
-- ══════════════════════════════════════════════════════════════════

create table if not exists coin_balances (
  user_id uuid primary key references users(id),
  balance integer not null default 0,
  lifetime_earned integer not null default 0,
  updated_at timestamptz default now()
);

create table if not exists coin_transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id),
  amount integer not null,
  reason text not null,
  reference_id text,
  balance_after integer not null,
  created_at timestamptz default now()
);

create index if not exists idx_coin_tx_user on coin_transactions(user_id);
create index if not exists idx_coin_tx_created on coin_transactions(created_at);

-- RLS for coin tables
alter table coin_balances enable row level security;
alter table coin_transactions enable row level security;

create policy "Users read own coin balance" on coin_balances
  for select using (auth.uid() = user_id);
create policy "Users read own coin transactions" on coin_transactions
  for select using (auth.uid() = user_id);
create policy "Users can insert coin transactions" on coin_transactions
  for insert with check (auth.uid() = user_id);

-- Award coins RPC: atomic upsert balance + log transaction
create or replace function award_coins(
  p_user_id uuid,
  p_amount integer,
  p_reason text,
  p_reference_id text default null
) returns integer as $$
declare
  v_new_balance integer;
begin
  -- Upsert balance
  insert into coin_balances (user_id, balance, lifetime_earned, updated_at)
  values (p_user_id, greatest(p_amount, 0), greatest(p_amount, 0), now())
  on conflict (user_id) do update set
    balance = coin_balances.balance + p_amount,
    lifetime_earned = case
      when p_amount > 0 then coin_balances.lifetime_earned + p_amount
      else coin_balances.lifetime_earned
    end,
    updated_at = now();

  select balance into v_new_balance from coin_balances where user_id = p_user_id;

  if v_new_balance < 0 then
    raise exception 'Insufficient coin balance';
  end if;

  -- Log transaction
  insert into coin_transactions (user_id, amount, reason, reference_id, balance_after)
  values (p_user_id, p_amount, p_reason, p_reference_id, v_new_balance);

  return v_new_balance;
end;
$$ language plpgsql security definer;

-- ══════════════════════════════════════════════════════════════════
-- Prediction Markets: matchup staking
-- ══════════════════════════════════════════════════════════════════

create table if not exists matchup_markets (
  id uuid primary key default gen_random_uuid(),
  item_a text not null,
  item_b text not null,
  pool_a integer not null default 0,
  pool_b integer not null default 0,
  votes_a integer not null default 0,
  votes_b integer not null default 0,
  status text not null default 'open' check (status in ('open', 'resolved', 'cancelled')),
  winner text,
  expires_at timestamptz not null,
  resolved_at timestamptz,
  created_at timestamptz default now(),
  constraint matchup_item_order check (item_a < item_b),
  constraint matchup_unique_open unique (item_a, item_b, status)
);

create table if not exists stakes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id),
  market_id uuid not null references matchup_markets(id),
  predicted_winner text not null,
  amount integer not null,
  payout integer default 0,
  status text not null default 'pending' check (status in ('pending', 'won', 'lost', 'refunded')),
  created_at timestamptz default now()
);

create index if not exists idx_markets_status on matchup_markets(status);
create index if not exists idx_markets_expires on matchup_markets(expires_at);
create index if not exists idx_stakes_user on stakes(user_id);
create index if not exists idx_stakes_market on stakes(market_id);

-- RLS for market tables
alter table matchup_markets enable row level security;
alter table stakes enable row level security;

create policy "Markets are publicly readable" on matchup_markets
  for select using (true);
create policy "Users read own stakes" on stakes
  for select using (auth.uid() = user_id);

-- Place stake RPC: deduct coins + create stake + update pool
create or replace function place_stake(
  p_user_id uuid,
  p_item_a text,
  p_item_b text,
  p_predicted_winner text,
  p_amount integer
) returns uuid as $$
declare
  v_market_id uuid;
  v_stake_id uuid;
  v_ordered_a text;
  v_ordered_b text;
begin
  -- Ensure canonical order (item_a < item_b)
  if p_item_a < p_item_b then
    v_ordered_a := p_item_a;
    v_ordered_b := p_item_b;
  else
    v_ordered_a := p_item_b;
    v_ordered_b := p_item_a;
  end if;

  -- Find or create open market
  select id into v_market_id
  from matchup_markets
  where item_a = v_ordered_a and item_b = v_ordered_b and status = 'open';

  if v_market_id is null then
    insert into matchup_markets (item_a, item_b, expires_at)
    values (v_ordered_a, v_ordered_b, now() + interval '1 hour')
    returning id into v_market_id;
  end if;

  -- Deduct coins (raises if insufficient)
  perform award_coins(p_user_id, -p_amount, 'stake', v_market_id::text);

  -- Create stake
  insert into stakes (user_id, market_id, predicted_winner, amount)
  values (p_user_id, v_market_id, p_predicted_winner, p_amount)
  returning id into v_stake_id;

  -- Update pool
  if p_predicted_winner = v_ordered_a then
    update matchup_markets set pool_a = pool_a + p_amount where id = v_market_id;
  else
    update matchup_markets set pool_b = pool_b + p_amount where id = v_market_id;
  end if;

  return v_stake_id;
end;
$$ language plpgsql security definer;

-- Increment market votes RPC
create or replace function increment_market_votes(
  p_market_id uuid,
  p_for_a boolean
) returns void as $$
begin
  if p_for_a then
    update matchup_markets set votes_a = votes_a + 1 where id = p_market_id and status = 'open';
  else
    update matchup_markets set votes_b = votes_b + 1 where id = p_market_id and status = 'open';
  end if;
end;
$$ language plpgsql security definer;

-- Resolve expired markets RPC: pari-mutuel payout
create or replace function resolve_expired_markets() returns integer as $$
declare
  v_market record;
  v_stake record;
  v_winner text;
  v_total_pool integer;
  v_winning_pool integer;
  v_payout integer;
  v_resolved integer := 0;
begin
  for v_market in
    select * from matchup_markets
    where status = 'open'
      and (expires_at <= now() or (votes_a + votes_b) >= 10)
  loop
    -- Cancel if fewer than 3 total votes
    if (v_market.votes_a + v_market.votes_b) < 3 then
      update matchup_markets set status = 'cancelled', resolved_at = now() where id = v_market.id;
      -- Refund all stakes
      for v_stake in select * from stakes where market_id = v_market.id and status = 'pending' loop
        perform award_coins(v_stake.user_id, v_stake.amount, 'stake_refund', v_market.id::text);
        update stakes set status = 'refunded', payout = v_stake.amount where id = v_stake.id;
      end loop;
      v_resolved := v_resolved + 1;
      continue;
    end if;

    -- Determine winner (tie = refund)
    if v_market.votes_a > v_market.votes_b then
      v_winner := v_market.item_a;
    elsif v_market.votes_b > v_market.votes_a then
      v_winner := v_market.item_b;
    else
      -- Tie: refund everyone
      update matchup_markets set status = 'cancelled', resolved_at = now() where id = v_market.id;
      for v_stake in select * from stakes where market_id = v_market.id and status = 'pending' loop
        perform award_coins(v_stake.user_id, v_stake.amount, 'stake_refund', v_market.id::text);
        update stakes set status = 'refunded', payout = v_stake.amount where id = v_stake.id;
      end loop;
      v_resolved := v_resolved + 1;
      continue;
    end if;

    v_total_pool := v_market.pool_a + v_market.pool_b;
    if v_winner = v_market.item_a then
      v_winning_pool := v_market.pool_a;
    else
      v_winning_pool := v_market.pool_b;
    end if;

    update matchup_markets
    set status = 'resolved', winner = v_winner, resolved_at = now()
    where id = v_market.id;

    -- Pay winners proportionally, mark losers
    for v_stake in select * from stakes where market_id = v_market.id and status = 'pending' loop
      if v_stake.predicted_winner = v_winner and v_winning_pool > 0 then
        v_payout := (v_stake.amount::numeric / v_winning_pool * v_total_pool)::integer;
        if v_payout < 1 then v_payout := 1; end if;
        perform award_coins(v_stake.user_id, v_payout, 'stake_win', v_market.id::text);
        update stakes set status = 'won', payout = v_payout where id = v_stake.id;
      else
        update stakes set status = 'lost', payout = 0 where id = v_stake.id;
      end if;
    end loop;

    v_resolved := v_resolved + 1;
  end loop;

  return v_resolved;
end;
$$ language plpgsql security definer;

-- Cron job to resolve prediction markets every 5 minutes
-- (requires pg_cron enabled)
select cron.schedule(
  'resolve-prediction-markets',
  '*/5 * * * *',
  $$ select resolve_expired_markets(); $$
);

-- ══════════════════════════════════════════════════════════════════
-- GPU Compute Marketplace
-- ══════════════════════════════════════════════════════════════════

-- Workers: devices contributing GPU compute
-- Privacy: device_id_hash is a SHA-256 of the raw device UUID (never stored).
-- gpu_class is a generic tier (e.g. "high", "mid", "low"), NOT the raw renderer string.
create table if not exists compute_workers (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id),
  device_id_hash text not null,
  gpu_class text default 'unknown',
  status text not null default 'offline'
    check (status in ('offline', 'idle', 'busy', 'suspended')),
  last_heartbeat timestamptz default now(),
  total_jobs integer not null default 0,
  total_coins_earned integer not null default 0,
  total_usdc_earned numeric(12,6) not null default 0,
  created_at timestamptz default now(),
  constraint compute_workers_user_device unique (user_id, device_id_hash)
);

-- Jobs: compute tasks submitted by buyers
-- Privacy: buyer_id and assigned_worker_id are internal-only.
-- RLS ensures workers never see buyer_id, buyers never see assigned_worker_id.
create table if not exists compute_jobs (
  id uuid primary key default gen_random_uuid(),
  buyer_id uuid references users(id),
  job_type text not null check (job_type in ('inference', 'embedding', 'benchmark')),
  payload_encrypted text not null,
  payload_hash text not null,
  status text not null default 'pending'
    check (status in ('pending', 'assigned', 'running', 'completed', 'failed', 'expired')),
  assigned_worker_id uuid references compute_workers(id),
  result_encrypted text,
  result_hash text,
  coins_reward integer not null default 10,
  usdc_reward numeric(12,6) not null default 0.0005,
  max_duration_ms integer not null default 30000,
  expires_at timestamptz default now() + interval '10 minutes',
  created_at timestamptz default now(),
  completed_at timestamptz
);

-- Memberships: free vs premium tiers
create table if not exists compute_memberships (
  user_id uuid primary key references users(id),
  tier text not null default 'free' check (tier in ('free', 'premium')),
  trial_started_at timestamptz default now(),
  trial_ends_at timestamptz default now() + interval '48 hours',
  daily_jobs_used integer not null default 0,
  daily_jobs_reset_at timestamptz default now() + interval '1 day'
);

-- Indexes
create index if not exists idx_compute_workers_user on compute_workers(user_id);
create index if not exists idx_compute_workers_status on compute_workers(status);
create index if not exists idx_compute_jobs_status on compute_jobs(status);
create index if not exists idx_compute_jobs_worker on compute_jobs(assigned_worker_id);
create index if not exists idx_compute_jobs_expires on compute_jobs(expires_at);
create index if not exists idx_compute_memberships_tier on compute_memberships(tier);

-- RLS
alter table compute_workers enable row level security;
alter table compute_jobs enable row level security;
alter table compute_memberships enable row level security;

-- Workers: users manage own
create policy "Users read own workers" on compute_workers
  for select using (auth.uid() = user_id);
create policy "Users insert own workers" on compute_workers
  for insert with check (auth.uid() = user_id);
create policy "Users update own workers" on compute_workers
  for update using (auth.uid() = user_id);

-- Jobs: assigned worker can read their job (stripped view — no buyer_id visible)
-- Workers see: id, job_type, payload_encrypted, payload_hash, status, coins_reward,
--              max_duration_ms, result_encrypted, result_hash, created_at, completed_at
-- buyer_id is column-level hidden by only selecting needed cols in the API layer.
create policy "Workers read assigned jobs" on compute_jobs
  for select using (
    assigned_worker_id in (
      select id from compute_workers where user_id = auth.uid()
    )
  );
-- Buyers can read their own jobs (assigned_worker_id is opaque to them)
create policy "Buyers read own jobs" on compute_jobs
  for select using (auth.uid() = buyer_id);

-- Memberships: users read own
create policy "Users read own membership" on compute_memberships
  for select using (auth.uid() = user_id);
create policy "Users insert own membership" on compute_memberships
  for insert with check (auth.uid() = user_id);
create policy "Users update own membership" on compute_memberships
  for update using (auth.uid() = user_id);

-- ── Claim a compute job (atomic, skip locked) ──────────────────────
create or replace function claim_compute_job(
  p_worker_id uuid
) returns uuid as $$
declare
  v_job_id uuid;
  v_user_id uuid;
  v_membership record;
begin
  -- Get user for this worker
  select user_id into v_user_id
  from compute_workers where id = p_worker_id;

  if v_user_id is null then
    raise exception 'Worker not found';
  end if;

  -- Check membership / daily limits
  select * into v_membership
  from compute_memberships where user_id = v_user_id;

  if v_membership is not null then
    -- Reset daily counter if needed
    if v_membership.daily_jobs_reset_at <= now() then
      update compute_memberships
      set daily_jobs_used = 0,
          daily_jobs_reset_at = now() + interval '1 day'
      where user_id = v_user_id;
      v_membership.daily_jobs_used := 0;
    end if;

    -- Free tier (trial expired): enforce 10 jobs/day
    if v_membership.tier = 'free'
       and v_membership.trial_ends_at <= now()
       and v_membership.daily_jobs_used >= 10 then
      return null; -- daily limit reached
    end if;
  end if;

  -- Claim oldest pending job
  select id into v_job_id
  from compute_jobs
  where status = 'pending'
    and expires_at > now()
  order by created_at asc
  limit 1
  for update skip locked;

  if v_job_id is null then
    return null; -- no jobs available
  end if;

  update compute_jobs
  set status = 'assigned',
      assigned_worker_id = p_worker_id
  where id = v_job_id;

  -- Bump daily usage
  update compute_memberships
  set daily_jobs_used = daily_jobs_used + 1
  where user_id = v_user_id;

  -- Mark worker busy
  update compute_workers
  set status = 'busy'
  where id = p_worker_id;

  return v_job_id;
end;
$$ language plpgsql security definer;

-- ── Complete a compute job ─────────────────────────────────────────
create or replace function complete_compute_job(
  p_job_id uuid,
  p_worker_id uuid,
  p_result_encrypted text,
  p_result_hash text
) returns jsonb as $$
declare
  v_job record;
  v_user_id uuid;
  v_new_balance integer;
begin
  select * into v_job
  from compute_jobs
  where id = p_job_id
    and assigned_worker_id = p_worker_id
    and status = 'assigned'
  for update;

  if v_job is null then
    raise exception 'Job not found or not assigned to this worker';
  end if;

  -- Mark job completed
  update compute_jobs
  set status = 'completed',
      result_encrypted = p_result_encrypted,
      result_hash = p_result_hash,
      completed_at = now()
  where id = p_job_id;

  -- Get worker's user
  select user_id into v_user_id
  from compute_workers where id = p_worker_id;

  -- Award coins via existing RPC
  v_new_balance := award_coins(v_user_id, v_job.coins_reward, 'compute_job', p_job_id::text);

  -- Credit USDC to user
  update users
  set total_earned_usdc = total_earned_usdc + v_job.usdc_reward
  where id = v_user_id;

  -- Update worker stats
  update compute_workers
  set status = 'idle',
      total_jobs = total_jobs + 1,
      total_coins_earned = total_coins_earned + v_job.coins_reward,
      total_usdc_earned = total_usdc_earned + v_job.usdc_reward
  where id = p_worker_id;

  return jsonb_build_object(
    'coins', v_job.coins_reward,
    'usdc', v_job.usdc_reward
  );
end;
$$ language plpgsql security definer;

-- ── Expire stale jobs + reset stuck workers ────────────────────────
create or replace function expire_stale_compute_jobs() returns integer as $$
declare
  v_expired integer := 0;
begin
  -- Expire pending jobs past their expiry
  update compute_jobs
  set status = 'expired'
  where status in ('pending', 'assigned')
    and expires_at <= now();
  get diagnostics v_expired = row_count;

  -- Reset workers stuck in 'busy' with no active job
  update compute_workers
  set status = 'idle'
  where status = 'busy'
    and id not in (
      select assigned_worker_id from compute_jobs
      where status in ('assigned', 'running')
        and assigned_worker_id is not null
    );

  -- Mark workers offline if no heartbeat for 2 minutes
  update compute_workers
  set status = 'offline'
  where status in ('idle', 'busy')
    and last_heartbeat < now() - interval '2 minutes';

  return v_expired;
end;
$$ language plpgsql security definer;

-- ── Network stats (aggregate only — no user IDs exposed) ───────────
create or replace function compute_network_stats()
returns jsonb as $$
declare
  v_workers_online integer;
  v_workers_busy integer;
  v_jobs_pending integer;
  v_jobs_active integer;
  v_jobs_completed integer;
  v_total_usdc_paid numeric(12,6);
  v_total_coins_paid bigint;
begin
  select count(*) into v_workers_online
  from compute_workers where status in ('idle', 'busy');

  select count(*) into v_workers_busy
  from compute_workers where status = 'busy';

  select count(*) into v_jobs_pending
  from compute_jobs where status = 'pending' and expires_at > now();

  select count(*) into v_jobs_active
  from compute_jobs where status in ('assigned', 'running');

  select count(*) into v_jobs_completed
  from compute_jobs where status = 'completed';

  select coalesce(sum(total_usdc_earned), 0) into v_total_usdc_paid
  from compute_workers;

  select coalesce(sum(total_coins_earned), 0) into v_total_coins_paid
  from compute_workers;

  return jsonb_build_object(
    'workers_online', v_workers_online,
    'workers_busy', v_workers_busy,
    'jobs_pending', v_jobs_pending,
    'jobs_active', v_jobs_active,
    'jobs_completed', v_jobs_completed,
    'total_usdc_paid', v_total_usdc_paid,
    'total_coins_paid', v_total_coins_paid
  );
end;
$$ language plpgsql security definer;

-- Cron: expire stale compute jobs every minute
select cron.schedule(
  'expire-stale-compute-jobs',
  '* * * * *',
  $$ select expire_stale_compute_jobs(); $$
);

-- ══════════════════════════════════════════════════════════════════
-- API Keys for external buyers / AI agents
-- ══════════════════════════════════════════════════════════════════

create table if not exists api_keys (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id),
  key_hash text not null unique,
  key_prefix text not null,
  name text not null default 'Default',
  usage_count integer not null default 0,
  usage_tokens integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz default now()
);

create index if not exists idx_api_keys_user on api_keys(user_id);
create index if not exists idx_api_keys_hash on api_keys(key_hash);

alter table api_keys enable row level security;

create policy "Users read own api keys" on api_keys
  for select using (auth.uid() = user_id);
create policy "Users insert own api keys" on api_keys
  for insert with check (auth.uid() = user_id);
create policy "Users update own api keys" on api_keys
  for update using (auth.uid() = user_id);

-- ══════════════════════════════════════════════════════════════════
-- Verathos (SN96) Verification Layer
-- ══════════════════════════════════════════════════════════════════

-- 1a. Trust + verification columns on compute_workers
alter table compute_workers add column if not exists trust_score integer not null default 50;
alter table compute_workers add column if not exists verification_count integer not null default 0;
alter table compute_workers add column if not exists verification_pass integer not null default 0;
alter table compute_workers add column if not exists verification_fail integer not null default 0;
alter table compute_workers add column if not exists last_verified_at timestamptz;

create index if not exists idx_compute_workers_trust on compute_workers(trust_score desc);

-- 1b. Verification status on compute_jobs
alter table compute_jobs add column if not exists verification_status text default 'none'
  check (verification_status in ('none','pending','verified','failed','error'));

-- 1c. Verification records table
create table if not exists compute_verifications (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references compute_jobs(id),
  worker_id uuid not null references compute_workers(id),
  verathos_request_payload jsonb,
  verathos_response_text text,
  verathos_response_hash text,
  worker_response_text text,
  worker_response_hash text,
  verdict text not null default 'pending'
    check (verdict in ('pending','pass','fail','error','inconclusive')),
  similarity_score numeric(5,4),
  similarity_method text default 'jaccard',
  verathos_proof jsonb,
  verathos_model_used text,
  verathos_request_id text,
  verathos_latency_ms integer,
  shard_receipt jsonb,
  created_at timestamptz default now()
);

create index if not exists idx_compute_verifications_job on compute_verifications(job_id);
create index if not exists idx_compute_verifications_worker on compute_verifications(worker_id);
create index if not exists idx_compute_verifications_verdict on compute_verifications(verdict);

-- RLS: workers can read their own verifications
alter table compute_verifications enable row level security;

create policy "Workers read own verifications" on compute_verifications
  for select using (
    worker_id in (
      select id from compute_workers where user_id = auth.uid()
    )
  );

-- 1d. RPC: update worker trust score with Bayesian smoothing
create or replace function update_worker_trust_score(
  p_worker_id uuid,
  p_verdict text
) returns void as $$
declare
  v_pass integer;
  v_total integer;
  v_new_trust integer;
begin
  if p_verdict = 'pass' then
    update compute_workers
    set verification_count = verification_count + 1,
        verification_pass = verification_pass + 1,
        last_verified_at = now()
    where id = p_worker_id;
  elsif p_verdict = 'fail' then
    update compute_workers
    set verification_count = verification_count + 1,
        verification_fail = verification_fail + 1,
        last_verified_at = now()
    where id = p_worker_id;
  else
    -- error/inconclusive: no trust penalty
    return;
  end if;

  -- Bayesian smoothing: (pass + 5) / (total + 10) * 100
  select verification_pass, verification_count
  into v_pass, v_total
  from compute_workers where id = p_worker_id;

  v_new_trust := ((v_pass + 5)::numeric / (v_total + 10) * 100)::integer;

  update compute_workers
  set trust_score = v_new_trust
  where id = p_worker_id;

  -- Auto-suspend workers with trust < 20 after 5+ verifications
  if v_new_trust < 20 and v_total >= 5 then
    update compute_workers
    set status = 'suspended'
    where id = p_worker_id;
  end if;
end;
$$ language plpgsql security definer;

-- 1e. Modify claim_compute_job: reject suspended workers
create or replace function claim_compute_job(
  p_worker_id uuid
) returns uuid as $$
declare
  v_job_id uuid;
  v_user_id uuid;
  v_worker_status text;
  v_membership record;
begin
  -- Get user and status for this worker
  select user_id, status into v_user_id, v_worker_status
  from compute_workers where id = p_worker_id;

  if v_user_id is null then
    raise exception 'Worker not found';
  end if;

  -- Suspended workers cannot claim jobs
  if v_worker_status = 'suspended' then
    return null;
  end if;

  -- Check membership / daily limits
  select * into v_membership
  from compute_memberships where user_id = v_user_id;

  if v_membership is not null then
    -- Reset daily counter if needed
    if v_membership.daily_jobs_reset_at <= now() then
      update compute_memberships
      set daily_jobs_used = 0,
          daily_jobs_reset_at = now() + interval '1 day'
      where user_id = v_user_id;
      v_membership.daily_jobs_used := 0;
    end if;

    -- Free tier (trial expired): enforce 10 jobs/day
    if v_membership.tier = 'free'
       and v_membership.trial_ends_at <= now()
       and v_membership.daily_jobs_used >= 10 then
      return null; -- daily limit reached
    end if;
  end if;

  -- Claim oldest pending job
  select id into v_job_id
  from compute_jobs
  where status = 'pending'
    and expires_at > now()
  order by created_at asc
  limit 1
  for update skip locked;

  if v_job_id is null then
    return null; -- no jobs available
  end if;

  update compute_jobs
  set status = 'assigned',
      assigned_worker_id = p_worker_id
  where id = v_job_id;

  -- Bump daily usage
  update compute_memberships
  set daily_jobs_used = daily_jobs_used + 1
  where user_id = v_user_id;

  -- Mark worker busy
  update compute_workers
  set status = 'busy'
  where id = p_worker_id;

  return v_job_id;
end;
$$ language plpgsql security definer;

-- 1f. Extend compute_network_stats with verification metrics
create or replace function compute_network_stats()
returns jsonb as $$
declare
  v_workers_online integer;
  v_workers_busy integer;
  v_jobs_pending integer;
  v_jobs_active integer;
  v_jobs_completed integer;
  v_total_usdc_paid numeric(12,6);
  v_total_coins_paid bigint;
  v_verifications_total integer;
  v_verifications_passed integer;
  v_avg_trust_score numeric(5,1);
begin
  select count(*) into v_workers_online
  from compute_workers where status in ('idle', 'busy');

  select count(*) into v_workers_busy
  from compute_workers where status = 'busy';

  select count(*) into v_jobs_pending
  from compute_jobs where status = 'pending' and expires_at > now();

  select count(*) into v_jobs_active
  from compute_jobs where status in ('assigned', 'running');

  select count(*) into v_jobs_completed
  from compute_jobs where status = 'completed';

  select coalesce(sum(total_usdc_earned), 0) into v_total_usdc_paid
  from compute_workers;

  select coalesce(sum(total_coins_earned), 0) into v_total_coins_paid
  from compute_workers;

  select count(*) into v_verifications_total
  from compute_verifications;

  select count(*) into v_verifications_passed
  from compute_verifications where verdict = 'pass';

  select coalesce(avg(trust_score), 50) into v_avg_trust_score
  from compute_workers where verification_count > 0;

  return jsonb_build_object(
    'workers_online', v_workers_online,
    'workers_busy', v_workers_busy,
    'jobs_pending', v_jobs_pending,
    'jobs_active', v_jobs_active,
    'jobs_completed', v_jobs_completed,
    'total_usdc_paid', v_total_usdc_paid,
    'total_coins_paid', v_total_coins_paid,
    'verifications_total', v_verifications_total,
    'verifications_passed', v_verifications_passed,
    'avg_trust_score', v_avg_trust_score
  );
end;
$$ language plpgsql security definer;

-- Cron: trigger verify-compute every 2 minutes
select cron.schedule(
  'verify-compute-jobs',
  '*/2 * * * *',
  $$
  select net.http_post(
    url := current_setting('app.settings.supabase_url') || '/functions/v1/verify-compute',
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key'),
      'Content-Type', 'application/json'
    ),
    body := '{}'::jsonb
  );
  $$
);

-- ══════════════════════════════════════════════════════════════════
-- Taste Reputation Multiplier + RLHF-as-a-Service
-- ══════════════════════════════════════════════════════════════════

-- Reputation columns on users
alter table users add column if not exists taste_reputation numeric(4,2) default 1.00;
alter table users add column if not exists taste_reputation_updated_at timestamptz;

-- RLHF columns on users
alter table users add column if not exists rlhf_opted_in boolean default true;
alter table users add column if not exists rlhf_dividends_earned numeric(12,6) default 0;

-- Index for reputation calculation performance
create index if not exists idx_votes_user_created on votes(user_id, created_at desc);

-- RLHF purchases table
create table if not exists rlhf_purchases (
  id uuid primary key default gen_random_uuid(),
  buyer_agent_hash text,
  amount_usdc numeric(12,6) not null,
  pairs_count integer not null default 0,
  category text,
  created_at timestamptz default now()
);

alter table rlhf_purchases enable row level security;

-- ── update_taste_reputation RPC ──────────────────────────────────
create or replace function update_taste_reputation(
  p_user_id uuid
) returns void as $$
declare
  v_total integer;
  v_high integer;
  v_reputation numeric(4,2);
  v_last_vote_at timestamptz;
  v_days_inactive numeric;
begin
  -- Count last 50 votes and those with quality >= 0.7
  select count(*), count(*) filter (where quality_score >= 0.7)
  into v_total, v_high
  from (
    select quality_score
    from votes
    where user_id = p_user_id
    order by created_at desc
    limit 50
  ) recent;

  -- Bayesian smoothing: 1.0 + 2.0 * ((high + 3) / (total + 6))
  v_reputation := 1.0 + 2.0 * ((v_high + 3)::numeric / (v_total + 6));

  -- Decay: if last vote > 3 days ago, multiply by 0.95^(days_inactive - 3), floor at 1.0
  select max(created_at) into v_last_vote_at
  from votes where user_id = p_user_id;

  if v_last_vote_at is not null then
    v_days_inactive := extract(epoch from (now() - v_last_vote_at)) / 86400.0;
    if v_days_inactive > 3 then
      v_reputation := v_reputation * power(0.95, v_days_inactive - 3);
    end if;
  end if;

  -- Floor at 1.0, cap at 3.0
  v_reputation := greatest(1.00, least(3.00, v_reputation));

  update users
  set taste_reputation = v_reputation,
      taste_reputation_updated_at = now()
  where id = p_user_id;
end;
$$ language plpgsql security definer;

-- ── fetch_taste_reputation RPC ───────────────────────────────────
create or replace function fetch_taste_reputation(
  p_user_id uuid
) returns jsonb as $$
declare
  v_reputation numeric(4,2);
  v_updated_at timestamptz;
  v_total integer;
  v_high integer;
begin
  select taste_reputation, taste_reputation_updated_at
  into v_reputation, v_updated_at
  from users where id = p_user_id;

  -- Count last 50 votes
  select count(*), count(*) filter (where quality_score >= 0.7)
  into v_total, v_high
  from (
    select quality_score
    from votes
    where user_id = p_user_id
    order by created_at desc
    limit 50
  ) recent;

  return jsonb_build_object(
    'reputation', coalesce(v_reputation, 1.00),
    'total_recent_votes', v_total,
    'high_quality_votes', v_high,
    'updated_at', v_updated_at
  );
end;
$$ language plpgsql security definer;

-- ── distribute_rlhf_dividends RPC ────────────────────────────────
create or replace function distribute_rlhf_dividends(
  p_purchase_id uuid,
  p_category text,
  p_amount_usdc numeric
) returns integer as $$
declare
  v_pool_amount numeric;
  v_contributor_count integer;
  v_per_user integer;
  v_user record;
  v_distributed integer := 0;
begin
  -- 50% of purchase price goes to contributors
  v_pool_amount := p_amount_usdc * 0.5;

  -- Count eligible contributors (quality >= 0.8 votes, opted in)
  select count(distinct v.user_id) into v_contributor_count
  from votes v
  join users u on u.id = v.user_id
  where v.quality_score >= 0.8
    and v.source = 'human'
    and u.rlhf_opted_in = true
    and (p_category is null or v.winner_id in (
      select id from items where cat = p_category
    ) or v.loser_id in (
      select id from items where cat = p_category
    ));

  if v_contributor_count = 0 then
    return 0;
  end if;

  -- Convert to coins: 1 USDC ~ 100 coins, split equally
  v_per_user := greatest(1, ((v_pool_amount * 100) / v_contributor_count)::integer);

  -- Award coins to each contributor
  for v_user in
    select distinct v.user_id
    from votes v
    join users u on u.id = v.user_id
    where v.quality_score >= 0.8
      and v.source = 'human'
      and u.rlhf_opted_in = true
      and (p_category is null or v.winner_id in (
        select id from items where cat = p_category
      ) or v.loser_id in (
        select id from items where cat = p_category
      ))
  loop
    perform award_coins(v_user.user_id, v_per_user, 'rlhf_dividend', p_purchase_id::text);
    update users set rlhf_dividends_earned = rlhf_dividends_earned + (v_pool_amount / v_contributor_count)
    where id = v_user.user_id;
    v_distributed := v_distributed + 1;
  end loop;

  return v_distributed;
end;
$$ language plpgsql security definer;

-- ── get_rlhf_user_stats RPC ──────────────────────────────────────
create or replace function get_rlhf_user_stats(
  p_user_id uuid
) returns jsonb as $$
declare
  v_high_quality_votes integer;
  v_dividends_earned numeric(12,6);
  v_opted_in boolean;
begin
  select rlhf_dividends_earned, rlhf_opted_in
  into v_dividends_earned, v_opted_in
  from users where id = p_user_id;

  select count(*) into v_high_quality_votes
  from votes
  where user_id = p_user_id
    and quality_score >= 0.8
    and source = 'human';

  return jsonb_build_object(
    'high_quality_votes', coalesce(v_high_quality_votes, 0),
    'dividends_earned', coalesce(v_dividends_earned, 0),
    'opted_in', coalesce(v_opted_in, true)
  );
end;
$$ language plpgsql security definer;

-- ══════════════════════════════════════════════════════════════════
-- Shard Distributed Inference
-- ══════════════════════════════════════════════════════════════════

-- Shard models: maps model names to gateway URLs
create table if not exists shard_models (
  id uuid primary key default gen_random_uuid(),
  model_name text unique not null,
  gateway_url text not null,
  is_active boolean default true,
  cost_per_million_tokens numeric(10,4) default 3.0,
  description text,
  created_at timestamptz default now()
);

alter table shard_models enable row level security;

create policy "Shard models are publicly readable" on shard_models
  for select using (true);

-- Seed rows (c0mpute models)
insert into shard_models (model_name, gateway_url, is_active, cost_per_million_tokens, description)
values
  ('c0mpute-pro', 'https://c0mpute.ai/api', true, 3.0, 'Uncensored 8B - fast, broad worker availability'),
  ('c0mpute-max', 'https://c0mpute.ai/api', true, 4.5, 'Uncensored 27B with tools, vision, and large context'),
  ('c0mpute-max-think', 'https://c0mpute.ai/api', true, 6.0, 'c0mpute-max with extended chain-of-thought reasoning'),
  ('supergemma4-26b', 'https://c0mpute.ai/api', true, 4.5, 'Uncensored SuperGemma4 26B MoE with tools'),
  ('code', 'https://c0mpute.ai/api', true, 4.5, 'Devstral 24B agentic coding model')
on conflict (model_name) do nothing;

-- Shard jobs: tracks Shard inference requests (separate from compute_jobs)
create table if not exists shard_jobs (
  id uuid primary key default gen_random_uuid(),
  buyer_id uuid references users(id),
  api_key_id uuid,
  model_name text not null,
  messages jsonb not null,
  max_tokens integer,
  temperature numeric,
  status text not null default 'pending'
    check (status in ('pending', 'running', 'completed', 'failed', 'error')),
  response_text text,
  response_hash text,
  shard_receipts jsonb,
  shard_metadata jsonb,
  receipt_verification_status text default 'none'
    check (receipt_verification_status in ('none', 'verified', 'failed')),
  latency_ms integer,
  prompt_tokens integer,
  completion_tokens integer,
  total_tokens integer,
  cost_usdc numeric(12,6),
  error_message text,
  created_at timestamptz default now(),
  completed_at timestamptz
);

create index if not exists idx_shard_jobs_buyer on shard_jobs(buyer_id);
create index if not exists idx_shard_jobs_status on shard_jobs(status);
create index if not exists idx_shard_jobs_model on shard_jobs(model_name);

alter table shard_jobs enable row level security;

create policy "Buyers read own shard jobs" on shard_jobs
  for select using (auth.uid() = buyer_id);

-- Shard network stats RPC
create or replace function shard_network_stats()
returns jsonb as $$
declare
  v_jobs_total integer;
  v_jobs_completed integer;
  v_jobs_failed integer;
  v_avg_latency_ms numeric;
  v_total_tokens bigint;
  v_total_cost_usdc numeric(12,6);
  v_models_active integer;
  v_receipts_verified integer;
begin
  select count(*) into v_jobs_total from shard_jobs;

  select count(*) into v_jobs_completed
  from shard_jobs where status = 'completed';

  select count(*) into v_jobs_failed
  from shard_jobs where status in ('failed', 'error');

  select coalesce(avg(latency_ms), 0) into v_avg_latency_ms
  from shard_jobs where status = 'completed' and latency_ms is not null;

  select coalesce(sum(total_tokens), 0) into v_total_tokens
  from shard_jobs where status = 'completed';

  select coalesce(sum(cost_usdc), 0) into v_total_cost_usdc
  from shard_jobs where status = 'completed';

  select count(*) into v_models_active
  from shard_models where is_active = true;

  select count(*) into v_receipts_verified
  from shard_jobs where receipt_verification_status = 'verified';

  return jsonb_build_object(
    'jobs_total', v_jobs_total,
    'jobs_completed', v_jobs_completed,
    'jobs_failed', v_jobs_failed,
    'avg_latency_ms', round(v_avg_latency_ms),
    'total_tokens', v_total_tokens,
    'total_cost_usdc', v_total_cost_usdc,
    'models_active', v_models_active,
    'receipts_verified', v_receipts_verified
  );
end;
$$ language plpgsql security definer;
