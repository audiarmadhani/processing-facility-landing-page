-- HEQA facility visitor registration.
-- Everything lives in its own `visitors` schema, which is NOT exposed to the
-- API. The website only talks to two SECURITY DEFINER functions in `public`
-- (prefixed heqa_) that validate input, so the anon/publishable key can never
-- read or list visitor data.

create schema if not exists visitors;
revoke all on schema visitors from public, anon, authenticated;

create table visitors.visits (
  id              uuid primary key default gen_random_uuid(),
  ref             text not null unique,
  created_at      timestamptz not null default now(),
  mode            text not null check (mode in ('pre_registered', 'walk_in')),
  status          text not null default 'expected'
                  check (status in ('expected', 'checked_in', 'checked_out', 'cancelled')),
  checked_in_at   timestamptz,
  checked_out_at  timestamptz,

  full_name       text not null check (char_length(full_name) between 2 and 120),
  company         text check (char_length(company) <= 160),
  email           text not null check (email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$' and char_length(email) <= 200),
  phone           text not null check (char_length(phone) between 6 and 40),
  country         text check (char_length(country) <= 80),

  visit_date      date not null,
  arrival_time    text check (char_length(arrival_time) <= 20),
  party_size      int  not null default 1 check (party_size between 1 and 40),
  companions      text check (char_length(companions) <= 1000),
  host_name       text check (char_length(host_name) <= 120),
  purpose         text not null check (purpose in
                  ('buyer', 'cupping', 'tour', 'producer', 'supplier', 'research', 'media', 'other')),
  notes           text check (char_length(notes) <= 2000),
  vehicle_plate   text check (char_length(vehicle_plate) <= 30),

  ack_safety      boolean not null check (ack_safety),
  ack_hygiene     boolean not null check (ack_hygiene),
  ack_photo       boolean not null check (ack_photo),
  health_ok       boolean not null check (health_ok),
  consent_data    boolean not null check (consent_data),
  marketing_ok    boolean not null default false,

  language        text not null default 'en' check (language in ('en', 'ja')),
  ip_hash         text
);

create index visits_visit_date_idx on visitors.visits (visit_date);
create index visits_ip_recent_idx  on visitors.visits (ip_hash, created_at desc);
alter table visitors.visits enable row level security;
-- No policies on purpose: only the functions below (and the dashboard/service role) touch it.

-- Short, unambiguous visit reference, e.g. HQ-7KD3PX
create or replace function visitors.new_ref() returns text
language plpgsql set search_path = '' as $$
declare
  alphabet constant text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  r text;
begin
  loop
    r := 'HQ-';
    for i in 1..6 loop
      r := r || substr(alphabet, 1 + floor(random() * length(alphabet))::int, 1);
    end loop;
    exit when not exists (select 1 from visitors.visits v where v.ref = r);
  end loop;
  return r;
end $$;

create or replace function public.heqa_register_visit(p jsonb, p_ip_hash text default null)
returns table (ref text, visit_date date, status text)
language plpgsql security definer set search_path = '' as $$
declare
  today date := (now() at time zone 'Asia/Makassar')::date; -- Bali (WITA)
  v_mode text := coalesce(p->>'mode', 'pre_registered');
  v_date date;
  v_row visitors.visits;
begin
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

-- A pre-registered guest checks in at the gate with their reference + email.
create or replace function public.heqa_check_in(p_ref text, p_email text)
returns table (ref text, full_name text, status text, visit_date date)
language plpgsql security definer set search_path = '' as $$
declare v_row visitors.visits;
begin
  update visitors.visits v
     set status = 'checked_in', checked_in_at = coalesce(v.checked_in_at, now())
   where v.ref = upper(btrim(p_ref))
     and v.email = lower(btrim(p_email))
     and v.status in ('expected', 'checked_in')
  returning * into v_row;

  if v_row.id is null then
    raise exception 'not_found' using errcode = 'P0001';
  end if;
  return query select v_row.ref, split_part(v_row.full_name, ' ', 1), v_row.status, v_row.visit_date;
end $$;

revoke all on function public.heqa_register_visit(jsonb, text) from public;
revoke all on function public.heqa_check_in(text, text) from public;
revoke all on function visitors.new_ref() from public;
grant execute on function public.heqa_register_visit(jsonb, text) to anon, authenticated;
grant execute on function public.heqa_check_in(text, text) to anon, authenticated;

-- Reception view: today's visitors (Bali time). Read it from the Supabase dashboard.
create or replace view visitors.today with (security_invoker = true) as
select ref, status, full_name, company, party_size, host_name, purpose,
       arrival_time, phone, vehicle_plate, checked_in_at, mode
from visitors.visits
where visit_date = (now() at time zone 'Asia/Makassar')::date
order by status desc, arrival_time nulls last, created_at;
