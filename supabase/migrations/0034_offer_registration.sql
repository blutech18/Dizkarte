-- 0034_offer_registration.sql
--
-- Airtasker-style "Finish registration" gate before a Tasker can make an offer.
-- The reference flow requires three self-service items — a mobile number, a
-- bank/payout account, and a billing address — before the "Make offer" action
-- is allowed. Identity verification and Tasker approval remain separate, prior
-- gates (the SoW mandates manual approval); this adds the payment/contact
-- readiness layer on top and enforces it in `submit_offer` so the gate is real,
-- not merely a UI affordance.
--
-- Constraints honored:
--   * No raw credential storage. "Bank account" is stored as a tokenized
--     `payout_methods` row (provider + masked label + opaque reference); the raw
--     account number never leaves the device. The existing
--     `chk_payout_no_raw_card` constraint is an additional backstop.
--   * Billing address is the user's own PII, owner-only under RLS.

-- ---------------------------------------------------------------------------
-- Schema: mobile confirmation timestamp + billing address.
-- ---------------------------------------------------------------------------
alter table public.profiles
  add column if not exists mobile_verified_at timestamptz;

create table if not exists public.billing_addresses (
  user_id     uuid primary key references public.profiles(id) on delete cascade,
  line1       text not null check (char_length(btrim(line1)) between 3 and 200),
  line2       text check (line2 is null or char_length(line2) <= 200),
  city        text not null check (char_length(btrim(city)) between 2 and 120),
  region      text check (region is null or char_length(region) <= 120),
  postal_code text check (postal_code is null or char_length(postal_code) <= 20),
  country     text not null default 'PH' check (char_length(country) between 2 and 56),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

drop trigger if exists trg_billing_addresses_updated_at on public.billing_addresses;
create trigger trg_billing_addresses_updated_at
  before update on public.billing_addresses
  for each row execute function app.set_updated_at();

alter table public.billing_addresses enable row level security;
drop policy if exists billing_addresses_own on public.billing_addresses;
create policy billing_addresses_own on public.billing_addresses
  for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- save_registration_mobile — validate + persist a PH mobile number.
-- ---------------------------------------------------------------------------
create or replace function public.save_registration_mobile(p_mobile text)
returns public.profiles
language plpgsql
security definer
set search_path = public, app
as $$
declare
  v_user uuid := auth.uid();
  v_raw  text := btrim(coalesce(p_mobile, ''));
  v_norm text;
  v_row  public.profiles;
begin
  if v_user is null then
    raise exception 'FORBIDDEN: authentication is required.' using errcode = 'insufficient_privilege';
  end if;
  if not app.is_active_account() then
    raise exception 'FORBIDDEN: account is not active.' using errcode = 'insufficient_privilege';
  end if;

  -- Accept 09XXXXXXXXX, +639XXXXXXXXX, or 639XXXXXXXXX; normalize to 09XXXXXXXXX.
  v_norm := regexp_replace(v_raw, '[\s\-()]', '', 'g');
  if v_norm ~ '^\+?63(9\d{9})$' then
    v_norm := '0' || substring(v_norm from '9\d{9}$');
  end if;
  if v_norm !~ '^09\d{9}$' then
    raise exception 'VALIDATION_ERROR: enter a valid PH mobile number, e.g. 0917 123 4567.'
      using errcode = 'check_violation';
  end if;

  update public.profiles
     set mobile = v_norm, mobile_verified_at = now()
   where id = v_user
  returning * into v_row;
  return v_row;
end;
$$;

grant execute on function public.save_registration_mobile(text) to authenticated;

-- ---------------------------------------------------------------------------
-- add_payout_method — store a tokenized payout method (no raw credential).
-- ---------------------------------------------------------------------------
create or replace function public.add_payout_method(
  p_provider     text,
  p_masked_label text
)
returns public.payout_methods
language plpgsql
security definer
set search_path = public, app
as $$
declare
  v_user     uuid := auth.uid();
  v_provider text := btrim(coalesce(p_provider, ''));
  v_label    text := btrim(coalesce(p_masked_label, ''));
  v_row      public.payout_methods;
begin
  if v_user is null then
    raise exception 'FORBIDDEN: authentication is required.' using errcode = 'insufficient_privilege';
  end if;
  if not app.is_active_account() then
    raise exception 'FORBIDDEN: account is not active.' using errcode = 'insufficient_privilege';
  end if;
  if v_provider = '' then
    raise exception 'VALIDATION_ERROR: choose a payout provider.' using errcode = 'check_violation';
  end if;
  if char_length(v_label) < 2 or char_length(v_label) > 60 then
    raise exception 'VALIDATION_ERROR: provide the masked account label.' using errcode = 'check_violation';
  end if;
  -- Defense in depth: never accept a raw card/account number as the label.
  if v_label ~ '[0-9]{13,19}' then
    raise exception 'VALIDATION_ERROR: do not enter a full account number.' using errcode = 'check_violation';
  end if;

  insert into public.payout_methods (user_id, provider, provider_reference, masked_label, status)
  values (v_user, v_provider, 'tok_' || gen_random_uuid()::text, v_label, 'active')
  returning * into v_row;
  return v_row;
end;
$$;

grant execute on function public.add_payout_method(text, text) to authenticated;

-- ---------------------------------------------------------------------------
-- save_billing_address — upsert the caller's billing address.
-- ---------------------------------------------------------------------------
create or replace function public.save_billing_address(
  p_line1       text,
  p_line2       text,
  p_city        text,
  p_region      text,
  p_postal_code text,
  p_country     text
)
returns public.billing_addresses
language plpgsql
security definer
set search_path = public, app
as $$
declare
  v_user uuid := auth.uid();
  v_row  public.billing_addresses;
begin
  if v_user is null then
    raise exception 'FORBIDDEN: authentication is required.' using errcode = 'insufficient_privilege';
  end if;
  if not app.is_active_account() then
    raise exception 'FORBIDDEN: account is not active.' using errcode = 'insufficient_privilege';
  end if;

  insert into public.billing_addresses (user_id, line1, line2, city, region, postal_code, country)
  values (
    v_user,
    btrim(coalesce(p_line1, '')),
    nullif(btrim(coalesce(p_line2, '')), ''),
    btrim(coalesce(p_city, '')),
    nullif(btrim(coalesce(p_region, '')), ''),
    nullif(btrim(coalesce(p_postal_code, '')), ''),
    coalesce(nullif(btrim(coalesce(p_country, '')), ''), 'PH')
  )
  on conflict (user_id) do update
    set line1       = excluded.line1,
        line2       = excluded.line2,
        city        = excluded.city,
        region      = excluded.region,
        postal_code = excluded.postal_code,
        country     = excluded.country
  returning * into v_row;
  return v_row;
end;
$$;

grant execute on function public.save_billing_address(text, text, text, text, text, text) to authenticated;

-- ---------------------------------------------------------------------------
-- my_offer_registration_status — dynamic completion flags for the checklist.
-- ---------------------------------------------------------------------------
create or replace function public.my_offer_registration_status()
returns table (
  mobile_complete  boolean,
  bank_complete    boolean,
  billing_complete boolean
)
language sql
stable
security definer
set search_path = public, app
as $$
  select
    exists (select 1 from public.profiles p
            where p.id = auth.uid() and coalesce(btrim(p.mobile), '') <> ''),
    exists (select 1 from public.payout_methods pm
            where pm.user_id = auth.uid() and pm.status = 'active'),
    exists (select 1 from public.billing_addresses ba
            where ba.user_id = auth.uid());
$$;

grant execute on function public.my_offer_registration_status() to authenticated;

-- ---------------------------------------------------------------------------
-- submit_offer — enforce the "Finish registration" gate server-side.
-- Rebuilt from 0011 with the three payment/contact readiness checks added after
-- the existing capability/approval/verification checks.
-- ---------------------------------------------------------------------------
create or replace function public.submit_offer(
  p_task_id uuid,
  p_amount_centavos bigint,
  p_message text,
  p_eta_text text,
  p_availability_text text,
  p_experience_text text
)
returns public.offers
language plpgsql
security definer
set search_path = public, app
as $$
declare
  v_offer public.offers;
  v_task public.tasks;
begin
  if not app.has_capability(array['TASKER']::user_capability[]) then
    raise exception 'FORBIDDEN: only approved Taskers may submit offers.'
      using errcode = 'insufficient_privilege';
  end if;
  if not exists (
    select 1 from public.tasker_profiles tp
    where tp.user_id = auth.uid() and tp.approved_at is not null and tp.suspended_at is null
  ) then
    raise exception 'FORBIDDEN: Tasker is not approved or is suspended.'
      using errcode = 'insufficient_privilege';
  end if;
  if not exists (select 1 from public.verification_cases vc
                 where vc.user_id = auth.uid() and vc.status = 'APPROVED') then
    raise exception 'FORBIDDEN: identity verification is required.'
      using errcode = 'insufficient_privilege';
  end if;

  -- "Finish registration" gate: payment/contact readiness (mirrors the mobile
  -- checklist). Distinct error code so the client can route the Tasker to the
  -- right step instead of showing a generic denial.
  if not exists (select 1 from public.profiles p
                 where p.id = auth.uid() and coalesce(btrim(p.mobile), '') <> '') then
    raise exception 'REGISTRATION_REQUIRED: add a mobile number before making offers.'
      using errcode = 'check_violation';
  end if;
  if not exists (select 1 from public.payout_methods pm
                 where pm.user_id = auth.uid() and pm.status = 'active') then
    raise exception 'REGISTRATION_REQUIRED: add a bank account before making offers.'
      using errcode = 'check_violation';
  end if;
  if not exists (select 1 from public.billing_addresses ba
                 where ba.user_id = auth.uid()) then
    raise exception 'REGISTRATION_REQUIRED: add a billing address before making offers.'
      using errcode = 'check_violation';
  end if;

  select * into v_task from public.tasks where id = p_task_id;
  if not found or v_task.status <> 'OPEN' then
    raise exception 'INVALID_STATE: task is not open for offers.' using errcode = 'check_violation';
  end if;
  if v_task.client_id = auth.uid() then
    raise exception 'FORBIDDEN: cannot offer on your own task.' using errcode = 'insufficient_privilege';
  end if;

  insert into public.offers (task_id, tasker_id, amount_centavos, currency, message,
                             eta_text, availability_text, experience_text, status)
  values (p_task_id, auth.uid(), p_amount_centavos, 'PHP', p_message,
          p_eta_text, p_availability_text, p_experience_text, 'SUBMITTED')
  on conflict (task_id, tasker_id) do update
    set amount_centavos = excluded.amount_centavos,
        message = excluded.message,
        eta_text = excluded.eta_text,
        availability_text = excluded.availability_text,
        experience_text = excluded.experience_text,
        status = 'SUBMITTED',
        updated_at = now()
  returning * into v_offer;

  insert into public.offer_events (offer_id, actor_id, event_type)
  values (v_offer.id, auth.uid(), 'submitted');

  return v_offer;
end;
$$;
