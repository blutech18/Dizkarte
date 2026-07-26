-- 0006_finance_ledger.sql
-- Payment intents, provider event inbox, append-only balanced ledger, refunds,
-- and withdrawals. No mutable authoritative balance column exists; balances are
-- always derived from immutable ledger entries.

create table if not exists public.payment_intents (
  id                uuid primary key default gen_random_uuid(),
  booking_id        uuid not null references public.bookings(id) on delete cascade,
  provider          text not null,
  provider_reference text,
  amount_centavos   bigint not null check (amount_centavos > 0),
  currency          text not null default 'PHP' check (currency = 'PHP'),
  status            payment_status not null default 'CREATED',
  idempotency_key   text not null,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  constraint uq_payment_intent_idempotency unique (idempotency_key),
  constraint uq_payment_intent_provider_reference unique (provider, provider_reference)
);

create index if not exists ix_payment_intents_booking on public.payment_intents (booking_id);

drop trigger if exists trg_payment_intents_updated_at on public.payment_intents;
create trigger trg_payment_intents_updated_at
  before update on public.payment_intents
  for each row execute function app.set_updated_at();

-- Provider event inbox for signed webhook events. Payload is restricted; only
-- a hash and safe fields are retained. External event id is unique for replay
-- protection.
create table if not exists public.provider_events (
  id                uuid primary key default gen_random_uuid(),
  provider          text not null,
  external_event_id text not null,
  event_type        text not null,
  provider_reference text,
  amount_centavos   bigint,
  currency          text,
  signature_valid   boolean not null,
  payload_hash      text not null,
  processing_status provider_event_status not null default 'RECEIVED',
  error_code        text,
  received_at       timestamptz not null default now(),
  processed_at      timestamptz,
  constraint uq_provider_event unique (provider, external_event_id)
);

create index if not exists ix_provider_events_status on public.provider_events (processing_status);

-- Ledger accounts. Platform accounts have null owner_id; user accounts set it.
create table if not exists public.ledger_accounts (
  id           uuid primary key default gen_random_uuid(),
  owner_type   text not null check (owner_type in ('platform', 'client', 'tasker')),
  owner_id     uuid references public.profiles(id) on delete restrict,
  account_type ledger_account_type not null,
  currency     text not null default 'PHP' check (currency = 'PHP'),
  created_at   timestamptz not null default now(),
  constraint uq_ledger_account unique (owner_type, owner_id, account_type, currency)
);

create index if not exists ix_ledger_accounts_owner on public.ledger_accounts (owner_id);

create table if not exists public.ledger_transactions (
  id                uuid primary key default gen_random_uuid(),
  booking_id        uuid references public.bookings(id) on delete restrict,
  type              ledger_transaction_type not null,
  idempotency_key   text not null,
  provider_event_id uuid references public.provider_events(id),
  created_by        uuid references public.profiles(id),
  metadata          jsonb not null default '{}'::jsonb,
  created_at        timestamptz not null default now(),
  constraint uq_ledger_transaction_idempotency unique (idempotency_key)
);

create index if not exists ix_ledger_transactions_booking on public.ledger_transactions (booking_id);

create table if not exists public.ledger_entries (
  id             uuid primary key default gen_random_uuid(),
  transaction_id uuid not null references public.ledger_transactions(id) on delete restrict,
  account_id     uuid not null references public.ledger_accounts(id) on delete restrict,
  amount_centavos bigint not null check (amount_centavos <> 0),
  created_at     timestamptz not null default now()
);

create index if not exists ix_ledger_entries_transaction on public.ledger_entries (transaction_id);
create index if not exists ix_ledger_entries_account on public.ledger_entries (account_id);

-- ---------------------------------------------------------------------------
-- Immutability: ledger transactions and entries are append-only.
-- ---------------------------------------------------------------------------
create or replace function app.forbid_mutation()
returns trigger
language plpgsql
as $$
begin
  raise exception 'Ledger rows are append-only and cannot be % (immutable).', tg_op
    using errcode = 'restrict_violation';
end;
$$;

drop trigger if exists trg_ledger_entries_immutable on public.ledger_entries;
create trigger trg_ledger_entries_immutable
  before update or delete on public.ledger_entries
  for each row execute function app.forbid_mutation();

drop trigger if exists trg_ledger_transactions_immutable on public.ledger_transactions;
create trigger trg_ledger_transactions_immutable
  before update or delete on public.ledger_transactions
  for each row execute function app.forbid_mutation();

-- ---------------------------------------------------------------------------
-- Balanced-to-zero enforcement via a DEFERRED constraint trigger. Checked at
-- commit so multi-entry inserts within a transaction can complete first.
-- ---------------------------------------------------------------------------
create or replace function app.assert_transaction_balanced()
returns trigger
language plpgsql
as $$
declare
  v_sum bigint;
  v_count integer;
begin
  select coalesce(sum(amount_centavos), 0), count(*)
    into v_sum, v_count
  from public.ledger_entries
  where transaction_id = new.transaction_id;

  if v_count < 2 then
    raise exception 'Ledger transaction % must have at least two entries.', new.transaction_id
      using errcode = 'check_violation';
  end if;

  if v_sum <> 0 then
    raise exception 'Ledger transaction % is not balanced (sum=%).', new.transaction_id, v_sum
      using errcode = 'check_violation';
  end if;

  return null;
end;
$$;

drop trigger if exists trg_ledger_entries_balanced on public.ledger_entries;
create constraint trigger trg_ledger_entries_balanced
  after insert on public.ledger_entries
  deferrable initially deferred
  for each row execute function app.assert_transaction_balanced();

-- ---------------------------------------------------------------------------
-- Refunds and withdrawals
-- ---------------------------------------------------------------------------
create table if not exists public.refunds (
  id                uuid primary key default gen_random_uuid(),
  payment_intent_id uuid not null references public.payment_intents(id) on delete restrict,
  amount_centavos   bigint not null check (amount_centavos > 0),
  status            refund_status not null default 'REQUESTED',
  reason            text,
  provider_reference text,
  idempotency_key   text not null,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  constraint uq_refund_idempotency unique (idempotency_key)
);

drop trigger if exists trg_refunds_updated_at on public.refunds;
create trigger trg_refunds_updated_at
  before update on public.refunds
  for each row execute function app.set_updated_at();

create table if not exists public.withdrawals (
  id                uuid primary key default gen_random_uuid(),
  tasker_id         uuid not null references public.profiles(id) on delete restrict,
  payout_method_id  uuid not null references public.payout_methods(id) on delete restrict,
  amount_centavos   bigint not null check (amount_centavos > 0),
  status            withdrawal_status not null default 'REQUESTED',
  provider_reference text,
  idempotency_key   text not null,
  failure_reason    text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  constraint uq_withdrawal_idempotency unique (idempotency_key)
);

create index if not exists ix_withdrawals_tasker on public.withdrawals (tasker_id, created_at desc);

drop trigger if exists trg_withdrawals_updated_at on public.withdrawals;
create trigger trg_withdrawals_updated_at
  before update on public.withdrawals
  for each row execute function app.set_updated_at();
