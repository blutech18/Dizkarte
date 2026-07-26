-- seed.sql — SYNTHETIC development seed data only.
-- Contains no real users, PII, payment details, exact addresses, or tokens.
-- User rows are intentionally NOT seeded here because they require auth.users;
-- create synthetic auth users through the Supabase Auth admin API in dev only.
-- Seed version: 2026-07-21.1

insert into public.app_settings (key, typed_value)
values
  ('seed_version', to_jsonb('2026-07-21.1'::text)),
  ('platform_fee_bps', to_jsonb(0)),          -- fee is zero by default (not the illustrative 8%)
  ('optional_client_fee_enabled', to_jsonb(false)),
  ('auto_release_enabled', to_jsonb(false)),  -- Client-confirmed release only
  ('public_pin_decimal_places', to_jsonb(3))
on conflict (key) do nothing;

insert into public.categories (slug, name, active, sort_order) values
  ('home-cleaning',    'Home Cleaning',       true, 10),
  ('handyman',         'Handyman & Repairs',  true, 20),
  ('appliance-repair', 'Appliance Repair',    true, 30),
  ('moving-hauling',   'Moving & Hauling',    true, 40),
  ('gardening',        'Gardening & Lawn',    true, 50),
  ('tutoring',         'Tutoring',            true, 60),
  ('errands',          'Errands & Delivery',  true, 70),
  ('tech-support',     'Tech Support',        true, 80)
on conflict (slug) do nothing;

insert into public.specialties (slug, name, active, sort_order) values
  ('plumbing',      'Plumbing',            true, 10),
  ('electrical',    'Electrical',          true, 20),
  ('carpentry',     'Carpentry',           true, 30),
  ('painting',      'Painting',            true, 40),
  ('aircon',        'Aircon Servicing',    true, 50),
  ('deep-cleaning', 'Deep Cleaning',       true, 60),
  ('math-tutoring', 'Math Tutoring',       true, 70),
  ('pc-repair',     'Computer Repair',     true, 80)
on conflict (slug) do nothing;

-- Synthetic locality reference is documented as pending the approved PSGC
-- source/version; codes here are placeholders for development only.
