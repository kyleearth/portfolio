-- Count distinct anonymous voters without exposing their stored hashes.

create or replace function public.get_travel_voter_count()
returns bigint
language sql
stable
security definer
set search_path = ''
as $$
  select count(distinct votes.ip_hash)::bigint
  from public.travel_votes as votes;
$$;

revoke all on function public.get_travel_voter_count() from public, anon, authenticated;
grant execute on function public.get_travel_voter_count() to service_role;
