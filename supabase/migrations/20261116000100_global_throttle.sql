-- Global backstop: callers can skip p_ip_hash, so cap total registrations per minute.
create or replace function visitors.assert_not_flooded() returns void
language plpgsql set search_path = '' as $$
begin
  if (select count(*) from visitors.visits v where v.created_at > now() - interval '1 minute') >= 30 then
    raise exception 'rate_limited' using errcode = 'P0001';
  end if;
end $$;
revoke all on function visitors.assert_not_flooded() from public;

create or replace function public.heqa_register_visit(p jsonb, p_ip_hash text default null)
returns table (ref text, visit_date date, status text)
language plpgsql security definer set search_path = '' as $$
declare
  today date := (now() at time zone 'Asia/Makassar')::date; -- Bali (WITA)
  v_mode text := coalesce(p->>'mode', 'pre_registered');
  v_date date;
  v_row visitors.visits;
begin
  perform visitors.assert_not_flooded();
  if p_ip_hash is not null and (
    select count(*) from visitors.visits v
    where v.ip_hash = p_ip_hash and v.created_at > now() - interval '10 minutes'
  ) >= 8 then
    raise exception 'rate_limited' using errcode = 'P0001';
  end if;

  if v_mode = 'walk_in' then
    v_date := today;
  else
    v_date := (p->>'visit_date')::date;
    if v_date is null or v_date < today or v_date > today + 365 then
      raise exception 'invalid_visit_date' using errcode = 'P0001';
    end if;
  end if;

  insert into visitors.visits (
    ref, mode, status, checked_in_at,
    full_name, company, email, phone, country,
    visit_date, arrival_time, party_size, companions, host_name, purpose, notes, vehicle_plate,
    ack_safety, ack_hygiene, ack_photo, health_ok, consent_data, marketing_ok,
    language, ip_hash
  ) values (
    visitors.new_ref(), v_mode,
    case when v_mode = 'walk_in' then 'checked_in' else 'expected' end,
    case when v_mode = 'walk_in' then now() end,
    btrim(p->>'full_name'), nullif(btrim(p->>'company'), ''), lower(btrim(p->>'email')),
    btrim(p->>'phone'), nullif(btrim(p->>'country'), ''),
    v_date, nullif(p->>'arrival_time', ''), coalesce((p->>'party_size')::int, 1),
    nullif(btrim(p->>'companions'), ''), nullif(btrim(p->>'host_name'), ''), p->>'purpose',
    nullif(btrim(p->>'notes'), ''), nullif(upper(btrim(p->>'vehicle_plate')), ''),
    coalesce((p->>'ack_safety')::boolean, false), coalesce((p->>'ack_hygiene')::boolean, false),
    coalesce((p->>'ack_photo')::boolean, false), coalesce((p->>'health_ok')::boolean, false),
    coalesce((p->>'consent_data')::boolean, false), coalesce((p->>'marketing_ok')::boolean, false),
    coalesce(p->>'language', 'en'), p_ip_hash
  ) returning * into v_row;

  return query select v_row.ref, v_row.visit_date, v_row.status;
end $$;

