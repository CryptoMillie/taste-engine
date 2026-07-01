-- Taste Engine Schema (Clerk-compatible)
-- Run this in the Supabase SQL Editor
-- User IDs are text (Clerk format: user_2xAbc...) not uuid

-- Users table
create table if not exists users (
  id text primary key,
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
  user_id text references users(id),
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
  user_id text references users(id),
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

-- Permissive policies (Clerk auth does not set Supabase auth.uid())
-- All access control is handled at the application layer via Clerk
create policy "Items are publicly readable" on items for select using (true);
create policy "Items are publicly insertable" on items for insert with check (true);
create policy "Items are publicly updatable" on items for update using (true);
create policy "Campaigns are publicly readable" on campaigns for select using (true);
create policy "Campaign items are publicly readable" on campaign_items for select using (true);

create policy "Users are publicly readable" on users for select using (true);
create policy "Users are publicly insertable" on users for insert with check (true);
create policy "Users are publicly updatable" on users for update using (true);

create policy "Votes are publicly insertable" on votes for insert with check (true);
create policy "Votes are publicly readable" on votes for select using (true);

create policy "Payouts are publicly readable" on payouts for select using (true);
create policy "Payouts are publicly insertable" on payouts for insert with check (true);

-- ══════════════════════════════════════════════════════════════════
-- Campaign payout RPCs
-- ══════════════════════════════════════════════════════════════════

create or replace function try_campaign_payout(
  p_campaign_id uuid,
  p_user_id text
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
end;
$$ language plpgsql security definer;

-- ══════════════════════════════════════════════════════════════════
-- Daily trending refresh via pg_cron
-- Uncomment after enabling pg_cron and pg_net extensions in Supabase Dashboard
-- and setting app.settings:
--   alter database postgres set app.settings.supabase_url = 'https://<PROJECT>.supabase.co';
--   alter database postgres set app.settings.service_role_key = '<SERVICE_ROLE_KEY>';
-- ══════════════════════════════════════════════════════════════════

-- select cron.schedule(
--   'daily-trending-refresh',
--   '0 11 * * *',
--   $$
--   select net.http_post(
--     url := current_setting('app.settings.supabase_url') || '/functions/v1/refresh-trending',
--     headers := jsonb_build_object(
--       'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key'),
--       'Content-Type', 'application/json'
--     ),
--     body := '{}'::jsonb
--   );
--   $$
-- );

-- ══════════════════════════════════════════════════════════════════
-- Auth columns on users
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
  user_id text primary key references users(id),
  balance integer not null default 0,
  lifetime_earned integer not null default 0,
  updated_at timestamptz default now()
);

create table if not exists coin_transactions (
  id uuid primary key default gen_random_uuid(),
  user_id text not null references users(id),
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

create policy "Coin balances are publicly readable" on coin_balances
  for select using (true);
create policy "Coin transactions are publicly readable" on coin_transactions
  for select using (true);
create policy "Coin transactions are publicly insertable" on coin_transactions
  for insert with check (true);

-- Award coins RPC: atomic upsert balance + log transaction
create or replace function award_coins(
  p_user_id text,
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
  user_id text not null references users(id),
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
create policy "Stakes are publicly readable" on stakes
  for select using (true);

-- Place stake RPC: deduct coins + create stake + update pool
create or replace function place_stake(
  p_user_id text,
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

-- Notify PostgREST to reload schema cache
notify pgrst, 'reload schema';

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
-- Uncomment after enabling pg_cron extension
-- select cron.schedule(
--   'resolve-prediction-markets',
--   '*/5 * * * *',
--   $$ select resolve_expired_markets(); $$
-- );

-- ══════════════════════════════════════════════════════════════════
-- GPU Compute Marketplace
-- ══════════════════════════════════════════════════════════════════

create table if not exists compute_workers (
  id uuid primary key default gen_random_uuid(),
  user_id text not null references users(id),
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

create table if not exists compute_jobs (
  id uuid primary key default gen_random_uuid(),
  buyer_id text references users(id),
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

create table if not exists compute_memberships (
  user_id text primary key references users(id),
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

-- Permissive policies for Clerk-based auth
create policy "Compute workers are publicly readable" on compute_workers
  for select using (true);
create policy "Compute workers are publicly insertable" on compute_workers
  for insert with check (true);
create policy "Compute workers are publicly updatable" on compute_workers
  for update using (true);

create policy "Compute jobs are publicly readable" on compute_jobs
  for select using (true);

create policy "Compute memberships are publicly readable" on compute_memberships
  for select using (true);
create policy "Compute memberships are publicly insertable" on compute_memberships
  for insert with check (true);
create policy "Compute memberships are publicly updatable" on compute_memberships
  for update using (true);

-- ── Claim a compute job (atomic, skip locked) ──────────────────────
create or replace function claim_compute_job(
  p_worker_id uuid
) returns uuid as $$
declare
  v_job_id uuid;
  v_user_id text;
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
    if v_membership.daily_jobs_reset_at <= now() then
      update compute_memberships
      set daily_jobs_used = 0,
          daily_jobs_reset_at = now() + interval '1 day'
      where user_id = v_user_id;
      v_membership.daily_jobs_used := 0;
    end if;

    if v_membership.tier = 'free'
       and v_membership.trial_ends_at <= now()
       and v_membership.daily_jobs_used >= 10 then
      return null;
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
    return null;
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
  v_user_id text;
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

  update compute_jobs
  set status = 'completed',
      result_encrypted = p_result_encrypted,
      result_hash = p_result_hash,
      completed_at = now()
  where id = p_job_id;

  select user_id into v_user_id
  from compute_workers where id = p_worker_id;

  v_new_balance := award_coins(v_user_id, v_job.coins_reward, 'compute_job', p_job_id::text);

  update users
  set total_earned_usdc = total_earned_usdc + v_job.usdc_reward
  where id = v_user_id;

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
  update compute_jobs
  set status = 'expired'
  where status in ('pending', 'assigned')
    and expires_at <= now();
  get diagnostics v_expired = row_count;

  update compute_workers
  set status = 'idle'
  where status = 'busy'
    and id not in (
      select assigned_worker_id from compute_jobs
      where status in ('assigned', 'running')
        and assigned_worker_id is not null
    );

  update compute_workers
  set status = 'offline'
  where status in ('idle', 'busy')
    and last_heartbeat < now() - interval '2 minutes';

  return v_expired;
end;
$$ language plpgsql security definer;

-- ── Network stats (aggregate only) ───────────
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

-- Cron: expire stale compute jobs every minute
-- Uncomment after enabling pg_cron
-- select cron.schedule(
--   'expire-stale-compute-jobs',
--   '* * * * *',
--   $$ select expire_stale_compute_jobs(); $$
-- );

-- ══════════════════════════════════════════════════════════════════
-- API Keys for external buyers / AI agents
-- ══════════════════════════════════════════════════════════════════

create table if not exists api_keys (
  id uuid primary key default gen_random_uuid(),
  user_id text not null references users(id),
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

create policy "API keys are publicly readable" on api_keys
  for select using (true);
create policy "API keys are publicly insertable" on api_keys
  for insert with check (true);
create policy "API keys are publicly updatable" on api_keys
  for update using (true);

-- ══════════════════════════════════════════════════════════════════
-- Verathos (SN96) Verification Layer
-- ══════════════════════════════════════════════════════════════════

-- Trust + verification columns on compute_workers
alter table compute_workers add column if not exists trust_score integer not null default 50;
alter table compute_workers add column if not exists verification_count integer not null default 0;
alter table compute_workers add column if not exists verification_pass integer not null default 0;
alter table compute_workers add column if not exists verification_fail integer not null default 0;
alter table compute_workers add column if not exists last_verified_at timestamptz;

create index if not exists idx_compute_workers_trust on compute_workers(trust_score desc);

-- Verification status on compute_jobs
alter table compute_jobs add column if not exists verification_status text default 'none'
  check (verification_status in ('none','pending','verified','failed','error'));

-- Verification records table
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

alter table compute_verifications enable row level security;

create policy "Compute verifications are publicly readable" on compute_verifications
  for select using (true);

-- RPC: update worker trust score with Bayesian smoothing
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
    return;
  end if;

  select verification_pass, verification_count
  into v_pass, v_total
  from compute_workers where id = p_worker_id;

  v_new_trust := ((v_pass + 5)::numeric / (v_total + 10) * 100)::integer;

  update compute_workers
  set trust_score = v_new_trust
  where id = p_worker_id;

  if v_new_trust < 20 and v_total >= 5 then
    update compute_workers
    set status = 'suspended'
    where id = p_worker_id;
  end if;
end;
$$ language plpgsql security definer;

-- Cron: trigger verify-compute every 2 minutes
-- Uncomment after enabling pg_cron and pg_net
-- select cron.schedule(
--   'verify-compute-jobs',
--   '*/2 * * * *',
--   $$
--   select net.http_post(
--     url := current_setting('app.settings.supabase_url') || '/functions/v1/verify-compute',
--     headers := jsonb_build_object(
--       'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key'),
--       'Content-Type', 'application/json'
--     ),
--     body := '{}'::jsonb
--   );
--   $$
-- );

-- ══════════════════════════════════════════════════════════════════
-- Taste Reputation Multiplier + RLHF-as-a-Service
-- ══════════════════════════════════════════════════════════════════

alter table users add column if not exists taste_reputation numeric(4,2) default 1.00;
alter table users add column if not exists taste_reputation_updated_at timestamptz;

alter table users add column if not exists rlhf_opted_in boolean default true;
alter table users add column if not exists rlhf_dividends_earned numeric(12,6) default 0;

create index if not exists idx_votes_user_created on votes(user_id, created_at desc);

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
  p_user_id text
) returns void as $$
declare
  v_total integer;
  v_high integer;
  v_reputation numeric(4,2);
  v_last_vote_at timestamptz;
  v_days_inactive numeric;
begin
  select count(*), count(*) filter (where quality_score >= 0.7)
  into v_total, v_high
  from (
    select quality_score
    from votes
    where user_id = p_user_id
    order by created_at desc
    limit 50
  ) recent;

  v_reputation := 1.0 + 2.0 * ((v_high + 3)::numeric / (v_total + 6));

  select max(created_at) into v_last_vote_at
  from votes where user_id = p_user_id;

  if v_last_vote_at is not null then
    v_days_inactive := extract(epoch from (now() - v_last_vote_at)) / 86400.0;
    if v_days_inactive > 3 then
      v_reputation := v_reputation * power(0.95, v_days_inactive - 3);
    end if;
  end if;

  v_reputation := greatest(1.00, least(3.00, v_reputation));

  update users
  set taste_reputation = v_reputation,
      taste_reputation_updated_at = now()
  where id = p_user_id;
end;
$$ language plpgsql security definer;

-- ── fetch_taste_reputation RPC ───────────────────────────────────
create or replace function fetch_taste_reputation(
  p_user_id text
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
  v_pool_amount := p_amount_usdc * 0.5;

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

  v_per_user := greatest(1, ((v_pool_amount * 100) / v_contributor_count)::integer);

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
  p_user_id text
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

create table if not exists shard_jobs (
  id uuid primary key default gen_random_uuid(),
  buyer_id text references users(id),
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

create policy "Shard jobs are publicly readable" on shard_jobs
  for select using (true);

-- ══════════════════════════════════════════════════════════════════
-- Layer-Sharded Pipeline Inference
-- ══════════════════════════════════════════════════════════════════

create table if not exists compute_pipelines (
  id uuid primary key default gen_random_uuid(),
  model_name text not null,
  total_stages integer not null default 4,
  status text not null default 'forming'
    check (status in ('forming', 'ready', 'processing', 'draining', 'dissolved')),
  formed_at timestamptz,
  last_activity timestamptz default now(),
  config jsonb default '{}'::jsonb,
  created_at timestamptz default now()
);

create index if not exists idx_pipelines_status on compute_pipelines(status);
create index if not exists idx_pipelines_model on compute_pipelines(model_name);

alter table compute_pipelines enable row level security;
create policy "Pipelines are publicly readable" on compute_pipelines
  for select using (true);

create table if not exists pipeline_slots (
  id uuid primary key default gen_random_uuid(),
  pipeline_id uuid not null references compute_pipelines(id) on delete cascade,
  stage_index integer not null,
  worker_id uuid references compute_workers(id),
  layer_start integer not null,
  layer_end integer not null,
  status text not null default 'vacant'
    check (status in ('vacant', 'loading', 'ready', 'processing', 'failed')),
  last_heartbeat timestamptz default now(),
  created_at timestamptz default now(),
  constraint pipeline_slots_unique unique (pipeline_id, stage_index)
);

create index if not exists idx_pipeline_slots_pipeline on pipeline_slots(pipeline_id);
create index if not exists idx_pipeline_slots_worker on pipeline_slots(worker_id);

alter table pipeline_slots enable row level security;
create policy "Pipeline slots are publicly readable" on pipeline_slots
  for select using (true);

-- Pipeline columns on compute_workers
alter table compute_workers add column if not exists pipeline_id uuid references compute_pipelines(id);
alter table compute_workers add column if not exists pipeline_stage integer;
alter table compute_workers add column if not exists mode text default 'solo'
  check (mode in ('solo', 'pipeline'));

create table if not exists pipeline_jobs (
  id uuid primary key default gen_random_uuid(),
  pipeline_id uuid not null references compute_pipelines(id),
  buyer_id text references users(id),
  payload_encrypted text not null,
  payload_hash text not null,
  status text not null default 'pending'
    check (status in ('pending', 'stage_0', 'stage_1', 'stage_2', 'stage_3', 'completed', 'failed', 'expired')),
  current_stage integer default 0,
  result_encrypted text,
  result_hash text,
  coins_reward integer not null default 40,
  usdc_reward numeric(12,6) not null default 0.004,
  expires_at timestamptz default now() + interval '10 minutes',
  created_at timestamptz default now(),
  completed_at timestamptz
);

create index if not exists idx_pipeline_jobs_pipeline on pipeline_jobs(pipeline_id);
create index if not exists idx_pipeline_jobs_status on pipeline_jobs(status);
create index if not exists idx_pipeline_jobs_buyer on pipeline_jobs(buyer_id);

alter table pipeline_jobs enable row level security;
create policy "Pipeline jobs are publicly readable" on pipeline_jobs
  for select using (true);

create table if not exists pipeline_activations (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references pipeline_jobs(id) on delete cascade,
  from_stage integer not null,
  to_stage integer not null,
  activation_data text not null,
  activation_hash text not null,
  consumed_at timestamptz,
  created_at timestamptz default now()
);

create index if not exists idx_pipeline_activations_job_stage on pipeline_activations(job_id, to_stage);

alter table pipeline_activations enable row level security;
create policy "Pipeline activations are publicly readable" on pipeline_activations
  for select using (true);

-- ── join_pipeline RPC ───────────────────────────────────────────────
create or replace function join_pipeline(
  p_worker_id uuid,
  p_model_name text
) returns jsonb as $$
declare
  v_pipeline_id uuid;
  v_slot record;
  v_total_stages integer := 4;
  v_layers_per_stage integer := 8;
  v_total_layers integer := 32;
  v_config jsonb;
  v_all_filled boolean;
begin
  select p.id, p.total_stages, p.config
  into v_pipeline_id, v_total_stages, v_config
  from compute_pipelines p
  where p.model_name = p_model_name
    and p.status = 'forming'
  limit 1
  for update skip locked;

  if v_pipeline_id is null then
    v_config := jsonb_build_object(
      'total_layers', v_total_layers,
      'layers_per_stage', v_layers_per_stage,
      'hidden_dim', 4096,
      'ffn_dim', 14336,
      'n_heads', 32,
      'kv_heads', 8,
      'head_dim', 128,
      'vocab_size', 128256,
      'max_seq_len', 2048
    );

    insert into compute_pipelines (model_name, total_stages, status, config)
    values (p_model_name, v_total_stages, 'forming', v_config)
    returning id into v_pipeline_id;

    for i in 0..(v_total_stages - 1) loop
      insert into pipeline_slots (pipeline_id, stage_index, layer_start, layer_end, status)
      values (
        v_pipeline_id,
        i,
        i * v_layers_per_stage,
        (i + 1) * v_layers_per_stage,
        'vacant'
      );
    end loop;
  end if;

  select * into v_slot
  from pipeline_slots
  where pipeline_id = v_pipeline_id
    and status = 'vacant'
    and worker_id is null
  order by stage_index
  limit 1
  for update skip locked;

  if v_slot is null then
    raise exception 'No vacant slots available';
  end if;

  update pipeline_slots
  set worker_id = p_worker_id,
      status = 'loading',
      last_heartbeat = now()
  where id = v_slot.id;

  update compute_workers
  set mode = 'pipeline',
      pipeline_id = v_pipeline_id,
      pipeline_stage = v_slot.stage_index
  where id = p_worker_id;

  select not exists(
    select 1 from pipeline_slots
    where pipeline_id = v_pipeline_id
      and worker_id is null
  ) into v_all_filled;

  if v_all_filled then
    update compute_pipelines
    set status = 'ready',
        formed_at = now()
    where id = v_pipeline_id;
  end if;

  return jsonb_build_object(
    'pipeline_id', v_pipeline_id,
    'stage_index', v_slot.stage_index,
    'layer_start', v_slot.layer_start,
    'layer_end', v_slot.layer_end,
    'total_stages', v_total_stages,
    'config', v_config
  );
end;
$$ language plpgsql security definer;

-- ── leave_pipeline RPC ──────────────────────────────────────────────
create or replace function leave_pipeline(
  p_worker_id uuid
) returns void as $$
declare
  v_pipeline_id uuid;
  v_stage integer;
begin
  select pipeline_id, pipeline_stage
  into v_pipeline_id, v_stage
  from compute_workers
  where id = p_worker_id and mode = 'pipeline';

  if v_pipeline_id is null then
    return;
  end if;

  update pipeline_slots
  set worker_id = null,
      status = 'vacant'
  where pipeline_id = v_pipeline_id
    and stage_index = v_stage;

  update compute_workers
  set mode = 'solo',
      pipeline_id = null,
      pipeline_stage = null,
      status = 'idle'
  where id = p_worker_id;

  update compute_pipelines
  set status = 'draining'
  where id = v_pipeline_id
    and status in ('ready', 'processing');

  update pipeline_jobs
  set status = 'failed'
  where pipeline_id = v_pipeline_id
    and status not in ('completed', 'failed', 'expired');
end;
$$ language plpgsql security definer;

-- ── claim_pipeline_stage RPC ────────────────────────────────────────
create or replace function claim_pipeline_stage(
  p_pipeline_id uuid,
  p_stage_index integer
) returns jsonb as $$
declare
  v_job record;
  v_activation record;
begin
  if p_stage_index = 0 then
    select * into v_job
    from pipeline_jobs
    where pipeline_id = p_pipeline_id
      and status = 'pending'
      and expires_at > now()
    order by created_at asc
    limit 1
    for update skip locked;

    if v_job is null then
      return null;
    end if;

    update pipeline_jobs
    set status = 'stage_0',
        current_stage = 0
    where id = v_job.id;

    return jsonb_build_object(
      'job_id', v_job.id,
      'payload_encrypted', v_job.payload_encrypted,
      'payload_hash', v_job.payload_hash,
      'coins_reward', v_job.coins_reward,
      'usdc_reward', v_job.usdc_reward
    );
  else
    select pa.*, pj.id as job_id, pj.payload_encrypted, pj.coins_reward, pj.usdc_reward
    into v_activation
    from pipeline_activations pa
    join pipeline_jobs pj on pj.id = pa.job_id
    where pa.to_stage = p_stage_index
      and pa.consumed_at is null
      and pj.pipeline_id = p_pipeline_id
    order by pa.created_at asc
    limit 1
    for update of pa skip locked;

    if v_activation is null then
      return null;
    end if;

    update pipeline_activations
    set consumed_at = now()
    where id = v_activation.id;

    return jsonb_build_object(
      'job_id', v_activation.job_id,
      'activation_data', v_activation.activation_data,
      'activation_hash', v_activation.activation_hash,
      'from_stage', v_activation.from_stage,
      'coins_reward', v_activation.coins_reward,
      'usdc_reward', v_activation.usdc_reward
    );
  end if;
end;
$$ language plpgsql security definer;

-- ── submit_activation RPC ───────────────────────────────────────────
create or replace function submit_activation(
  p_job_id uuid,
  p_from_stage integer,
  p_activation_data text,
  p_activation_hash text
) returns void as $$
declare
  v_next_stage integer;
  v_next_status text;
begin
  v_next_stage := p_from_stage + 1;
  v_next_status := 'stage_' || v_next_stage::text;

  insert into pipeline_activations (job_id, from_stage, to_stage, activation_data, activation_hash)
  values (p_job_id, p_from_stage, v_next_stage, p_activation_data, p_activation_hash);

  update pipeline_jobs
  set status = v_next_status,
      current_stage = v_next_stage
  where id = p_job_id;
end;
$$ language plpgsql security definer;

-- ── complete_pipeline_job RPC ───────────────────────────────────────
create or replace function complete_pipeline_job(
  p_job_id uuid,
  p_result_encrypted text,
  p_result_hash text
) returns jsonb as $$
declare
  v_job record;
  v_slot record;
  v_coins_per_worker integer;
  v_usdc_per_worker numeric(12,6);
  v_user_id text;
begin
  select * into v_job
  from pipeline_jobs
  where id = p_job_id
  for update;

  if v_job is null then
    raise exception 'Pipeline job not found';
  end if;

  update pipeline_jobs
  set status = 'completed',
      result_encrypted = p_result_encrypted,
      result_hash = p_result_hash,
      completed_at = now()
  where id = p_job_id;

  update compute_pipelines
  set last_activity = now()
  where id = v_job.pipeline_id;

  select total_stages into v_coins_per_worker
  from compute_pipelines where id = v_job.pipeline_id;

  v_coins_per_worker := v_job.coins_reward / v_coins_per_worker;
  v_usdc_per_worker := v_job.usdc_reward / (select total_stages from compute_pipelines where id = v_job.pipeline_id);

  for v_slot in
    select ps.worker_id
    from pipeline_slots ps
    where ps.pipeline_id = v_job.pipeline_id
      and ps.worker_id is not null
  loop
    select user_id into v_user_id
    from compute_workers where id = v_slot.worker_id;

    if v_user_id is not null then
      perform award_coins(v_user_id, v_coins_per_worker, 'pipeline_job', p_job_id::text);

      update users
      set total_earned_usdc = total_earned_usdc + v_usdc_per_worker
      where id = v_user_id;

      update compute_workers
      set total_jobs = total_jobs + 1,
          total_coins_earned = total_coins_earned + v_coins_per_worker,
          total_usdc_earned = total_usdc_earned + v_usdc_per_worker
      where id = v_slot.worker_id;
    end if;
  end loop;

  return jsonb_build_object(
    'coins_per_worker', v_coins_per_worker,
    'usdc_per_worker', v_usdc_per_worker
  );
end;
$$ language plpgsql security definer;

-- ── pipeline_heartbeat RPC ──────────────────────────────────────────
create or replace function pipeline_heartbeat(
  p_pipeline_id uuid,
  p_stage_index integer
) returns void as $$
begin
  update pipeline_slots
  set last_heartbeat = now()
  where pipeline_id = p_pipeline_id
    and stage_index = p_stage_index;

  update compute_pipelines
  set last_activity = now()
  where id = p_pipeline_id;
end;
$$ language plpgsql security definer;

-- ── handle_pipeline_worker_drop RPC ─────────────────────────────────
create or replace function handle_pipeline_worker_drop(
  p_pipeline_id uuid,
  p_stage_index integer
) returns void as $$
declare
  v_worker_id uuid;
begin
  select worker_id into v_worker_id
  from pipeline_slots
  where pipeline_id = p_pipeline_id
    and stage_index = p_stage_index;

  update pipeline_slots
  set status = 'failed',
      worker_id = null
  where pipeline_id = p_pipeline_id
    and stage_index = p_stage_index;

  if v_worker_id is not null then
    update compute_workers
    set mode = 'solo',
        pipeline_id = null,
        pipeline_stage = null,
        status = 'offline'
    where id = v_worker_id;
  end if;

  update compute_pipelines
  set status = 'draining'
  where id = p_pipeline_id
    and status in ('ready', 'processing');

  update pipeline_jobs
  set status = 'failed'
  where pipeline_id = p_pipeline_id
    and status not in ('completed', 'failed', 'expired');
end;
$$ language plpgsql security definer;

-- ── Cleanup stale pipelines ────────────────────────────────────
create or replace function cleanup_stale_pipelines() returns integer as $$
declare
  v_cleaned integer := 0;
  v_pipeline record;
  v_slot record;
begin
  for v_pipeline in
    select * from compute_pipelines
    where status = 'draining'
      and last_activity < now() - interval '2 minutes'
  loop
    for v_slot in
      select worker_id from pipeline_slots
      where pipeline_id = v_pipeline.id and worker_id is not null
    loop
      update compute_workers
      set mode = 'solo', pipeline_id = null, pipeline_stage = null, status = 'idle'
      where id = v_slot.worker_id;
    end loop;

    update compute_pipelines set status = 'dissolved' where id = v_pipeline.id;
    v_cleaned := v_cleaned + 1;
  end loop;

  update pipeline_jobs
  set status = 'expired'
  where status = 'pending'
    and created_at < now() - interval '5 minutes';

  for v_slot in
    select ps.pipeline_id, ps.stage_index
    from pipeline_slots ps
    join compute_pipelines cp on cp.id = ps.pipeline_id
    where cp.status in ('ready', 'processing')
      and ps.worker_id is not null
      and ps.last_heartbeat < now() - interval '90 seconds'
  loop
    perform handle_pipeline_worker_drop(v_slot.pipeline_id, v_slot.stage_index);
    v_cleaned := v_cleaned + 1;
  end loop;

  delete from pipeline_activations
  where consumed_at is not null
    and consumed_at < now() - interval '5 minutes';

  return v_cleaned;
end;
$$ language plpgsql security definer;

-- Cron: cleanup stale pipelines every minute
-- Uncomment after enabling pg_cron
-- select cron.schedule(
--   'cleanup-stale-pipelines',
--   '* * * * *',
--   $$ select cleanup_stale_pipelines(); $$
-- );

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

-- ══════════════════════════════════════════════════════════════════
-- Mobile Micro-Tasks
-- ══════════════════════════════════════════════════════════════════

-- Worker type column on compute_workers
alter table compute_workers add column if not exists worker_type text default 'gpu';

-- Mobile tasks table
create table if not exists mobile_tasks (
  id uuid primary key default gen_random_uuid(),
  task_type text not null default 'preference-pair'
    check (task_type in ('preference-pair', 'label-verify', 'output-rating')),
  payload jsonb not null default '{}'::jsonb,
  status text not null default 'pending'
    check (status in ('pending', 'assigned', 'completed', 'expired')),
  assigned_worker uuid references compute_workers(id),
  result text,
  coins_reward integer not null default 2,
  usdc_reward numeric(12,6) not null default 0.000667,
  assigned_at timestamptz,
  created_at timestamptz default now(),
  completed_at timestamptz
);

create index if not exists idx_mobile_tasks_status on mobile_tasks(status);
create index if not exists idx_mobile_tasks_worker on mobile_tasks(assigned_worker);

alter table mobile_tasks enable row level security;

create policy "Mobile tasks are publicly readable" on mobile_tasks
  for select using (true);

-- ── claim_mobile_task RPC ─────────────────────────────────────────
create or replace function claim_mobile_task(
  p_worker_id uuid
) returns jsonb as $$
declare
  v_task record;
begin
  -- Expire stale assigned tasks (older than 2 minutes)
  update mobile_tasks
  set status = 'pending', assigned_worker = null, assigned_at = null
  where status = 'assigned'
    and assigned_at < now() - interval '2 minutes';

  -- Claim oldest pending task
  select * into v_task
  from mobile_tasks
  where status = 'pending'
  order by created_at asc
  limit 1
  for update skip locked;

  if v_task is null then
    return null;
  end if;

  update mobile_tasks
  set status = 'assigned',
      assigned_worker = p_worker_id,
      assigned_at = now()
  where id = v_task.id;

  return jsonb_build_object(
    'id', v_task.id,
    'task_type', v_task.task_type,
    'payload', v_task.payload,
    'coins_reward', v_task.coins_reward,
    'usdc_reward', v_task.usdc_reward
  );
end;
$$ language plpgsql security definer;

-- ── complete_mobile_task RPC ──────────────────────────────────────
create or replace function complete_mobile_task(
  p_task_id uuid,
  p_worker_id uuid,
  p_result text
) returns jsonb as $$
declare
  v_task record;
  v_user_id text;
begin
  select * into v_task
  from mobile_tasks
  where id = p_task_id
    and assigned_worker = p_worker_id
    and status = 'assigned'
  for update;

  if v_task is null then
    return jsonb_build_object('coins', 0, 'usdc', 0);
  end if;

  update mobile_tasks
  set status = 'completed',
      result = p_result,
      completed_at = now()
  where id = p_task_id;

  -- Award coins and USDC to the worker's user
  select user_id into v_user_id
  from compute_workers where id = p_worker_id;

  if v_user_id is not null and p_result != 'skip' then
    perform award_coins(v_user_id, v_task.coins_reward, 'mobile_task', p_task_id::text);

    update users
    set total_earned_usdc = total_earned_usdc + v_task.usdc_reward
    where id = v_user_id;

    update compute_workers
    set total_jobs = total_jobs + 1,
        total_coins_earned = total_coins_earned + v_task.coins_reward,
        total_usdc_earned = total_usdc_earned + v_task.usdc_reward
    where id = p_worker_id;
  end if;

  return jsonb_build_object(
    'coins', case when p_result = 'skip' then 0 else v_task.coins_reward end,
    'usdc', case when p_result = 'skip' then 0 else v_task.usdc_reward end
  );
end;
$$ language plpgsql security definer;

-- ── seed_mobile_tasks RPC ─────────────────────────────────────────
-- Auto-generates preference-pair tasks from recent vote matchups
create or replace function seed_mobile_tasks() returns integer as $$
declare
  v_vote record;
  v_seeded integer := 0;
  v_winner_name text;
  v_loser_name text;
  v_winner_img text;
  v_loser_img text;
  v_cat text;
begin
  for v_vote in
    select distinct on (v.winner_id, v.loser_id)
      v.winner_id, v.loser_id
    from votes v
    where v.created_at > now() - interval '24 hours'
      and v.source = 'human'
    order by v.winner_id, v.loser_id, v.created_at desc
    limit 50
  loop
    -- Check if we already have a task for this pair
    if exists (
      select 1 from mobile_tasks
      where payload->>'item_a' = v_vote.winner_id
        and payload->>'item_b' = v_vote.loser_id
        and created_at > now() - interval '12 hours'
    ) then
      continue;
    end if;

    select name, img, cat into v_winner_name, v_winner_img, v_cat
    from items where id = v_vote.winner_id;

    select name, img into v_loser_name, v_loser_img
    from items where id = v_vote.loser_id;

    if v_winner_name is null or v_loser_name is null then
      continue;
    end if;

    insert into mobile_tasks (task_type, payload, coins_reward, usdc_reward)
    values (
      'preference-pair',
      jsonb_build_object(
        'type', 'preference-pair',
        'item_a', v_vote.winner_id,
        'item_b', v_vote.loser_id,
        'option_a', v_winner_name,
        'option_b', v_loser_name,
        'image_a', v_winner_img,
        'image_b', v_loser_img,
        'context', coalesce(v_cat, 'general') || ' — which do you prefer?'
      ),
      2,
      0.000667
    );
    v_seeded := v_seeded + 1;
  end loop;

  return v_seeded;
end;
$$ language plpgsql security definer;

-- ── Updated compute_network_stats with mobile counts ──────────────
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
  v_mobile_workers integer;
  v_mobile_tasks_pending integer;
  v_mobile_tasks_completed integer;
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

  select count(*) into v_mobile_workers
  from compute_workers where worker_type = 'mobile' and status in ('idle', 'busy');

  select count(*) into v_mobile_tasks_pending
  from mobile_tasks where status = 'pending';

  select count(*) into v_mobile_tasks_completed
  from mobile_tasks where status = 'completed';

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
    'avg_trust_score', v_avg_trust_score,
    'mobile_workers', v_mobile_workers,
    'mobile_tasks_pending', v_mobile_tasks_pending,
    'mobile_tasks_completed', v_mobile_tasks_completed
  );
end;
$$ language plpgsql security definer;

-- ══════════════════════════════════════════════════════════════════
-- Closed-Loop Taste Training + Mysteries + Taste Twins
-- ══════════════════════════════════════════════════════════════════

-- Training batches queued for GPU workers
create table if not exists taste_training_batches (
  id uuid primary key default gen_random_uuid(),
  batch_data jsonb not null default '{}'::jsonb,
  batch_size integer not null default 0,
  status text not null default 'pending'
    check (status in ('pending', 'assigned', 'completed', 'failed')),
  assigned_worker_id uuid references compute_workers(id),
  result_embeddings jsonb,
  created_at timestamptz default now(),
  completed_at timestamptz
);

create index if not exists idx_training_batches_status on taste_training_batches(status);

alter table taste_training_batches enable row level security;
create policy "Training batches are publicly readable" on taste_training_batches
  for select using (true);
create policy "Training batches are publicly insertable" on taste_training_batches
  for insert with check (true);
create policy "Training batches are publicly updatable" on taste_training_batches
  for update using (true);

-- Item embedding vectors computed by workers
create table if not exists taste_embeddings (
  id uuid primary key default gen_random_uuid(),
  item_id text unique not null,
  embedding_vector jsonb not null default '[]'::jsonb,
  category text,
  version integer not null default 1,
  updated_at timestamptz default now()
);

create index if not exists idx_taste_embeddings_item on taste_embeddings(item_id);
create index if not exists idx_taste_embeddings_category on taste_embeddings(category);

alter table taste_embeddings enable row level security;
create policy "Taste embeddings are publicly readable" on taste_embeddings
  for select using (true);

-- Weekly mystery cards surfacing hidden correlations
create table if not exists taste_mysteries (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text not null,
  mystery_type text not null default 'correlation'
    check (mystery_type in ('correlation', 'upset', 'crossover')),
  payload jsonb not null default '{}'::jsonb,
  status text not null default 'active'
    check (status in ('active', 'resolved', 'expired')),
  vote_count integer not null default 0,
  expires_at timestamptz default now() + interval '7 days',
  created_at timestamptz default now()
);

create index if not exists idx_taste_mysteries_status on taste_mysteries(status);
create index if not exists idx_taste_mysteries_expires on taste_mysteries(expires_at);

alter table taste_mysteries enable row level security;
create policy "Taste mysteries are publicly readable" on taste_mysteries
  for select using (true);

-- User-submitted theories for mysteries
create table if not exists mystery_explanations (
  id uuid primary key default gen_random_uuid(),
  mystery_id uuid not null references taste_mysteries(id) on delete cascade,
  user_id text not null references users(id),
  explanation text not null,
  upvotes integer not null default 0,
  coins_awarded integer not null default 0,
  created_at timestamptz default now()
);

create index if not exists idx_mystery_explanations_mystery on mystery_explanations(mystery_id);
create index if not exists idx_mystery_explanations_user on mystery_explanations(user_id);

alter table mystery_explanations enable row level security;
create policy "Mystery explanations are publicly readable" on mystery_explanations
  for select using (true);
create policy "Mystery explanations are publicly insertable" on mystery_explanations
  for insert with check (true);

-- Twin/nemesis pairs per user
create table if not exists taste_matches (
  id uuid primary key default gen_random_uuid(),
  user_id text not null references users(id),
  match_user_id text not null references users(id),
  similarity_score numeric(5,4) not null default 0,
  match_type text not null default 'twin'
    check (match_type in ('twin', 'nemesis')),
  category_breakdown jsonb not null default '{}'::jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  constraint taste_matches_unique unique (user_id, match_user_id, match_type)
);

create index if not exists idx_taste_matches_user on taste_matches(user_id);

alter table taste_matches enable row level security;
create policy "Taste matches are publicly readable" on taste_matches
  for select using (true);

-- ── generate_training_batch RPC ──────────────────────────────────
-- Pulls recent high-quality votes + item metadata into a pending batch
create or replace function generate_training_batch(
  p_batch_size integer default 50
) returns uuid as $$
declare
  v_batch_id uuid;
  v_pairs jsonb;
begin
  select jsonb_agg(pair) into v_pairs
  from (
    select jsonb_build_object(
      'winner_id', v.winner_id,
      'loser_id', v.loser_id,
      'winner_name', wi.name,
      'loser_name', li.name,
      'winner_cat', wi.cat,
      'loser_cat', li.cat,
      'quality_score', v.quality_score
    ) as pair
    from votes v
    join items wi on wi.id = v.winner_id
    join items li on li.id = v.loser_id
    where v.quality_score >= 0.6
      and v.source = 'human'
      and v.created_at > now() - interval '7 days'
    order by v.created_at desc
    limit p_batch_size
  ) recent_pairs;

  if v_pairs is null or jsonb_array_length(v_pairs) < 5 then
    return null;
  end if;

  insert into taste_training_batches (batch_data, batch_size, status)
  values (v_pairs, jsonb_array_length(v_pairs), 'pending')
  returning id into v_batch_id;

  return v_batch_id;
end;
$$ language plpgsql security definer;

-- ── claim_training_job RPC ───────────────────────────────────────
-- Atomic claim of oldest pending batch (skip locked)
create or replace function claim_training_job(
  p_worker_id uuid
) returns jsonb as $$
declare
  v_batch record;
begin
  select * into v_batch
  from taste_training_batches
  where status = 'pending'
  order by created_at asc
  limit 1
  for update skip locked;

  if v_batch is null then
    return null;
  end if;

  update taste_training_batches
  set status = 'assigned',
      assigned_worker_id = p_worker_id
  where id = v_batch.id;

  return jsonb_build_object(
    'batch_id', v_batch.id,
    'batch_data', v_batch.batch_data,
    'batch_size', v_batch.batch_size
  );
end;
$$ language plpgsql security definer;

-- ── submit_training_result RPC ───────────────────────────────────
-- Stores embeddings, awards 20 coins + $0.001
create or replace function submit_training_result(
  p_batch_id uuid,
  p_worker_id uuid,
  p_result_embeddings jsonb
) returns jsonb as $$
declare
  v_batch record;
  v_user_id text;
  v_item record;
  v_coins integer := 20;
  v_usdc numeric(12,6) := 0.001;
begin
  select * into v_batch
  from taste_training_batches
  where id = p_batch_id
    and assigned_worker_id = p_worker_id
    and status = 'assigned'
  for update;

  if v_batch is null then
    return jsonb_build_object('coins', 0, 'usdc', 0);
  end if;

  update taste_training_batches
  set status = 'completed',
      result_embeddings = p_result_embeddings,
      completed_at = now()
  where id = p_batch_id;

  -- Upsert embeddings for each item
  for v_item in
    select key as item_id, value as vector
    from jsonb_each(p_result_embeddings)
  loop
    insert into taste_embeddings (item_id, embedding_vector, version, updated_at)
    values (v_item.item_id, v_item.vector, 1, now())
    on conflict (item_id) do update set
      embedding_vector = excluded.embedding_vector,
      version = taste_embeddings.version + 1,
      updated_at = now();
  end loop;

  -- Award coins and USDC
  select user_id into v_user_id
  from compute_workers where id = p_worker_id;

  if v_user_id is not null then
    perform award_coins(v_user_id, v_coins, 'taste_training', p_batch_id::text);

    update users
    set total_earned_usdc = total_earned_usdc + v_usdc
    where id = v_user_id;

    update compute_workers
    set total_jobs = total_jobs + 1,
        total_coins_earned = total_coins_earned + v_coins,
        total_usdc_earned = total_usdc_earned + v_usdc
    where id = p_worker_id;
  end if;

  return jsonb_build_object('coins', v_coins, 'usdc', v_usdc);
end;
$$ language plpgsql security definer;

-- ── generate_taste_mystery RPC ───────────────────────────────────
-- Analyzes vote patterns, creates a mystery (correlation, upset, or crossover)
create or replace function generate_taste_mystery() returns uuid as $$
declare
  v_mystery_id uuid;
  v_type text;
  v_title text;
  v_description text;
  v_payload jsonb;
  v_roll integer;
  v_item_a record;
  v_item_b record;
  v_cat_a text;
  v_cat_b text;
begin
  v_roll := floor(random() * 3)::integer;

  if v_roll = 0 then
    -- Correlation: two items that are co-preferred
    v_type := 'correlation';
    select wi.id, wi.name, wi.cat, count(*) as co_wins
    into v_item_a
    from votes v1
    join votes v2 on v2.user_id = v1.user_id
      and v2.winner_id != v1.winner_id
      and v2.created_at > now() - interval '7 days'
    join items wi on wi.id = v1.winner_id
    where v1.created_at > now() - interval '7 days'
      and v1.source = 'human'
    group by wi.id, wi.name, wi.cat
    order by co_wins desc
    limit 1;

    if v_item_a is null then return null; end if;

    select wi.id, wi.name, wi.cat
    into v_item_b
    from votes v1
    join votes v2 on v2.user_id = v1.user_id and v2.winner_id != v1.winner_id
    join items wi on wi.id = v2.winner_id
    where v1.winner_id = v_item_a.id
      and v1.created_at > now() - interval '7 days'
      and wi.id != v_item_a.id
    group by wi.id, wi.name, wi.cat
    order by count(*) desc
    limit 1;

    if v_item_b is null then return null; end if;

    v_title := 'Hidden Connection: ' || v_item_a.name || ' & ' || v_item_b.name;
    v_description := 'People who prefer ' || v_item_a.name || ' also tend to prefer ' || v_item_b.name || '. Why might these be linked?';
    v_payload := jsonb_build_object('item_a', v_item_a.id, 'item_b', v_item_b.id);

  elsif v_roll = 1 then
    -- Upset: item that wins despite lower rating
    v_type := 'upset';
    select wi.id, wi.name, wi.cat, wi.rating as winner_rating,
           li.id as loser_id, li.name as loser_name, li.rating as loser_rating,
           count(*) as upset_count
    into v_item_a
    from votes v
    join items wi on wi.id = v.winner_id
    join items li on li.id = v.loser_id
    where v.created_at > now() - interval '7 days'
      and wi.rating < li.rating - 50
      and v.source = 'human'
    group by wi.id, wi.name, wi.cat, wi.rating, li.id, li.name, li.rating
    order by upset_count desc
    limit 1;

    if v_item_a is null then return null; end if;

    v_title := 'Giant Killer: ' || v_item_a.name;
    v_description := v_item_a.name || ' keeps beating higher-ranked ' || v_item_a.loser_name || '. What''s the underdog appeal?';
    v_payload := jsonb_build_object('winner_id', v_item_a.id, 'loser_id', v_item_a.loser_id, 'upset_count', v_item_a.upset_count);

  else
    -- Crossover: cross-category preference pattern
    v_type := 'crossover';
    select v.winner_id, wi.name, wi.cat as winner_cat,
           v.loser_id, li.name as loser_name, li.cat as loser_cat,
           count(*) as cross_count
    into v_item_a
    from votes v
    join items wi on wi.id = v.winner_id
    join items li on li.id = v.loser_id
    where v.created_at > now() - interval '7 days'
      and wi.cat != li.cat
      and v.source = 'human'
    group by v.winner_id, wi.name, wi.cat, v.loser_id, li.name, li.cat
    order by cross_count desc
    limit 1;

    if v_item_a is null then return null; end if;

    v_title := 'Taste Crossover: ' || v_item_a.winner_cat || ' vs ' || v_item_a.loser_cat;
    v_description := v_item_a.name || ' (' || v_item_a.winner_cat || ') keeps winning over ' || v_item_a.loser_name || ' (' || v_item_a.loser_cat || '). What drives cross-category preferences?';
    v_payload := jsonb_build_object('winner_id', v_item_a.winner_id, 'loser_id', v_item_a.loser_id, 'winner_cat', v_item_a.winner_cat, 'loser_cat', v_item_a.loser_cat);
  end if;

  insert into taste_mysteries (title, description, mystery_type, payload, status, expires_at)
  values (v_title, v_description, v_type, v_payload, 'active', now() + interval '7 days')
  returning id into v_mystery_id;

  return v_mystery_id;
end;
$$ language plpgsql security definer;

-- ── compute_taste_matches RPC ────────────────────────────────────
-- Compares user's category win-rates against all others via cosine similarity
create or replace function compute_taste_matches(
  p_user_id text
) returns jsonb as $$
declare
  v_user_prefs jsonb;
  v_other record;
  v_best_twin record;
  v_best_nemesis record;
  v_best_twin_score numeric := -1;
  v_best_nemesis_score numeric := 2;
  v_similarity numeric;
  v_categories text[];
  v_user_vec numeric[];
  v_other_vec numeric[];
  v_dot numeric;
  v_mag_a numeric;
  v_mag_b numeric;
  v_cat_breakdown jsonb;
begin
  -- Build user's category win-rate vector
  select array_agg(win_rate order by cat), array_agg(cat order by cat)
  into v_user_vec, v_categories
  from (
    select wi.cat,
           count(*) filter (where v.winner_id = v.winner_id)::numeric /
           nullif(count(*), 0) as win_rate
    from votes v
    join items wi on wi.id = v.winner_id
    where v.user_id = p_user_id
      and v.source = 'human'
      and wi.cat is not null
    group by wi.cat
  ) user_cats;

  if v_user_vec is null or array_length(v_user_vec, 1) < 2 then
    return jsonb_build_object('twin', null, 'nemesis', null);
  end if;

  -- Compare against other users
  for v_other in
    select distinct user_id from votes
    where user_id != p_user_id and source = 'human'
    limit 100
  loop
    select array_agg(coalesce(win_rate, 0) order by cat)
    into v_other_vec
    from (
      select unnest(v_categories) as cat
    ) cats
    left join (
      select wi.cat,
             count(*)::numeric / nullif((select count(*) from votes where user_id = v_other.user_id), 0) as win_rate
      from votes v
      join items wi on wi.id = v.winner_id
      where v.user_id = v_other.user_id and v.source = 'human' and wi.cat is not null
      group by wi.cat
    ) other_cats using (cat);

    if v_other_vec is null then continue; end if;

    -- Cosine similarity
    v_dot := 0; v_mag_a := 0; v_mag_b := 0;
    for i in 1..array_length(v_user_vec, 1) loop
      v_dot := v_dot + v_user_vec[i] * coalesce(v_other_vec[i], 0);
      v_mag_a := v_mag_a + v_user_vec[i] * v_user_vec[i];
      v_mag_b := v_mag_b + coalesce(v_other_vec[i], 0) * coalesce(v_other_vec[i], 0);
    end loop;

    if v_mag_a > 0 and v_mag_b > 0 then
      v_similarity := v_dot / (sqrt(v_mag_a) * sqrt(v_mag_b));
    else
      v_similarity := 0;
    end if;

    if v_similarity > v_best_twin_score then
      v_best_twin_score := v_similarity;
      v_best_twin := v_other;
    end if;

    if v_similarity < v_best_nemesis_score then
      v_best_nemesis_score := v_similarity;
      v_best_nemesis := v_other;
    end if;
  end loop;

  -- Upsert twin
  if v_best_twin is not null then
    v_cat_breakdown := '{}';
    for i in 1..array_length(v_categories, 1) loop
      v_cat_breakdown := v_cat_breakdown || jsonb_build_object(v_categories[i], round(v_user_vec[i]::numeric, 3));
    end loop;

    insert into taste_matches (user_id, match_user_id, similarity_score, match_type, category_breakdown, updated_at)
    values (p_user_id, v_best_twin.user_id, v_best_twin_score, 'twin', v_cat_breakdown, now())
    on conflict (user_id, match_user_id, match_type) do update set
      similarity_score = excluded.similarity_score,
      category_breakdown = excluded.category_breakdown,
      updated_at = now();
  end if;

  -- Upsert nemesis
  if v_best_nemesis is not null then
    v_cat_breakdown := '{}';
    for i in 1..array_length(v_categories, 1) loop
      v_cat_breakdown := v_cat_breakdown || jsonb_build_object(v_categories[i], round(v_user_vec[i]::numeric, 3));
    end loop;

    insert into taste_matches (user_id, match_user_id, similarity_score, match_type, category_breakdown, updated_at)
    values (p_user_id, v_best_nemesis.user_id, 1 - v_best_nemesis_score, 'nemesis', v_cat_breakdown, now())
    on conflict (user_id, match_user_id, match_type) do update set
      similarity_score = excluded.similarity_score,
      category_breakdown = excluded.category_breakdown,
      updated_at = now();
  end if;

  return jsonb_build_object(
    'twin', case when v_best_twin is not null then jsonb_build_object(
      'user_id', v_best_twin.user_id,
      'similarity', round(v_best_twin_score::numeric, 4)
    ) else null end,
    'nemesis', case when v_best_nemesis is not null then jsonb_build_object(
      'user_id', v_best_nemesis.user_id,
      'divergence', round((1 - v_best_nemesis_score)::numeric, 4)
    ) else null end
  );
end;
$$ language plpgsql security definer;

-- ── fetch_active_mysteries RPC ───────────────────────────────────
-- Returns active unexpired mysteries sorted by weight
create or replace function fetch_active_mysteries(
  p_limit integer default 3
) returns jsonb as $$
declare
  v_mysteries jsonb;
begin
  select jsonb_agg(m order by m.vote_count desc, m.created_at desc)
  into v_mysteries
  from (
    select id, title, description, mystery_type, payload, vote_count, expires_at, created_at,
           (select count(*) from mystery_explanations where mystery_id = taste_mysteries.id) as theory_count
    from taste_mysteries
    where status = 'active'
      and expires_at > now()
    order by vote_count desc, created_at desc
    limit p_limit
  ) m;

  return coalesce(v_mysteries, '[]'::jsonb);
end;
$$ language plpgsql security definer;

-- Reload PostgREST schema cache so all RPCs are discoverable
notify pgrst, 'reload schema';
