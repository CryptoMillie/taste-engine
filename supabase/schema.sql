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
