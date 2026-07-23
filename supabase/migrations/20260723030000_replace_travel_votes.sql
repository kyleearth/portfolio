-- Replace one voter's complete destination selection in a single transaction.

create or replace function public.replace_travel_votes(
  p_ip_hash text,
  p_destinations text[]
)
returns integer
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  raw_destination text;
  clean_destination text;
  clean_destinations text[] := array[]::text[];
begin
  if p_ip_hash is null or p_ip_hash !~ '^[0-9a-f]{64}$' then
    raise exception using errcode = '22023', message = 'The voter identifier is invalid.';
  end if;

  foreach raw_destination in array coalesce(p_destinations, array[]::text[])
  loop
    clean_destination := btrim(coalesce(raw_destination, ''));

    if char_length(clean_destination) < 1 or char_length(clean_destination) > 100 then
      raise exception using errcode = '22023', message = 'The destination is invalid.';
    end if;

    if not (clean_destination = any(clean_destinations)) then
      clean_destinations := array_append(clean_destinations, clean_destination);
    end if;
  end loop;

  if cardinality(clean_destinations) > 5 then
    raise exception using errcode = 'P0001', message = 'VOTE_LIMIT_REACHED';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_ip_hash, 0));

  delete from public.travel_votes as votes
  where votes.ip_hash = p_ip_hash;

  insert into public.travel_votes (ip_hash, destination)
  select p_ip_hash, selected.destination
  from unnest(clean_destinations) as selected(destination);

  return cardinality(clean_destinations);
end;
$$;

revoke all on function public.replace_travel_votes(text, text[]) from public, anon, authenticated;
grant execute on function public.replace_travel_votes(text, text[]) to service_role;
