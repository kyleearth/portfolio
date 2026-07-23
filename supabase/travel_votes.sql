-- Shared destination voting for the Travel Footprint page.
-- Run this file once in the Supabase SQL Editor before deploying the
-- supabase/functions/travel-vote Edge Function.

create table if not exists public.travel_votes (
  ip_hash text not null,
  destination text not null,
  created_at timestamptz not null default now(),
  primary key (ip_hash, destination),
  constraint travel_votes_ip_hash_format
    check (ip_hash ~ '^[0-9a-f]{64}$'),
  constraint travel_votes_destination_length
    check (char_length(destination) between 1 and 100)
);

create index if not exists travel_votes_destination_idx
  on public.travel_votes (destination);

alter table public.travel_votes enable row level security;

-- Browsers cannot access vote rows or functions directly. Only the Edge
-- Function's secret database client receives permission.
revoke all on table public.travel_votes from public, anon, authenticated;

create or replace function public.get_travel_vote_totals()
returns table (destination text, vote_count bigint)
language sql
stable
security definer
set search_path = ''
as $$
  select votes.destination, count(*)::bigint as vote_count
  from public.travel_votes as votes
  group by votes.destination
  order by vote_count desc, votes.destination asc;
$$;

create or replace function public.set_travel_vote(
  p_ip_hash text,
  p_destination text,
  p_selected boolean
)
returns table (
  destination text,
  vote_count bigint,
  selected boolean,
  active_votes integer,
  remaining_votes integer
)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  clean_destination text := btrim(coalesce(p_destination, ''));
  current_count bigint;
  current_active_votes integer;
  is_selected boolean;
begin
  if p_ip_hash is null or p_ip_hash !~ '^[0-9a-f]{64}$' then
    raise exception using errcode = '22023', message = 'The voter identifier is invalid.';
  end if;

  if char_length(clean_destination) < 1 or char_length(clean_destination) > 100 then
    raise exception using errcode = '22023', message = 'The destination is invalid.';
  end if;

  -- Serialize changes for one IP hash so concurrent requests cannot exceed
  -- the five-active-vote limit.
  perform pg_advisory_xact_lock(hashtextextended(p_ip_hash, 0));

  if p_selected then
    if not exists (
      select 1
      from public.travel_votes as votes
      where votes.ip_hash = p_ip_hash
        and votes.destination = clean_destination
    ) then
      select count(*)::integer
      into current_active_votes
      from public.travel_votes as votes
      where votes.ip_hash = p_ip_hash;

      if current_active_votes >= 5 then
        raise exception using errcode = 'P0001', message = 'VOTE_LIMIT_REACHED';
      end if;

      insert into public.travel_votes (ip_hash, destination)
      values (p_ip_hash, clean_destination);
    end if;
  else
    delete from public.travel_votes as votes
    where votes.ip_hash = p_ip_hash
      and votes.destination = clean_destination;
  end if;

  select count(*)::bigint
  into current_count
  from public.travel_votes as votes
  where votes.destination = clean_destination;

  select count(*)::integer
  into current_active_votes
  from public.travel_votes as votes
  where votes.ip_hash = p_ip_hash;

  select exists (
    select 1
    from public.travel_votes as votes
    where votes.ip_hash = p_ip_hash
      and votes.destination = clean_destination
  )
  into is_selected;

  return query
  select
    clean_destination,
    current_count,
    is_selected,
    current_active_votes,
    greatest(0, 5 - current_active_votes);
end;
$$;

revoke all on function public.get_travel_vote_totals() from public, anon, authenticated;
revoke all on function public.set_travel_vote(text, text, boolean) from public, anon, authenticated;

grant execute on function public.get_travel_vote_totals() to service_role;
grant execute on function public.set_travel_vote(text, text, boolean) to service_role;
grant select, insert, delete on table public.travel_votes to service_role;
