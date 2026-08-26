-- 0038_task_question_definitions_and_answers.sql
--
-- Category-guided task questions and their structured answers.
--
-- WHY: posting a task collects category-specific specifics ("What are you
-- moving?", "Are there stairs?"). Those belong in their own rows, not buried in
-- the free-text description: Taskers need them to quote accurately, and keeping
-- them structured makes them renderable, and later filterable/searchable,
-- without re-parsing prose.
--
-- Two tables:
--   * task_question_definitions — the question catalogue, one set per category.
--     Data-driven on purpose: adding or rewording a question is a row change,
--     not an app release. Read-only to clients (like `categories`); writes are
--     service-role/Admin.
--   * task_answers — one row per (task, question) with the Client's answer.
--
-- NOTE: `public.task_questions` already exists and is something different — the
-- public Q&A where a Tasker asks the Client about a posted task. These
-- definitions are deliberately named `task_question_definitions` to avoid any
-- confusion with that table.
--
-- SAFETY: purely additive and idempotent. No existing table, column, policy, or
-- trigger is altered; re-running is a no-op (the seed upserts by natural key).

-- ---------------------------------------------------------------------------
-- 1. Question catalogue
-- ---------------------------------------------------------------------------

create table if not exists public.task_question_definitions (
  id          uuid primary key default gen_random_uuid(),
  category_id uuid not null references public.categories(id) on delete cascade,
  -- Stable per-category key. Survives label rewording, so existing answers keep
  -- their meaning and a set can be re-seeded without duplicating rows.
  code        text not null check (char_length(code) between 1 and 64),
  label       text not null check (char_length(label) between 1 and 200),
  input_kind  text not null check (input_kind in ('select', 'boolean', 'number', 'text')),
  -- Ordered choice labels for `select`. Always an array; empty for other kinds.
  options     jsonb not null default '[]'::jsonb check (jsonb_typeof(options) = 'array'),
  placeholder text check (placeholder is null or char_length(placeholder) <= 200),
  required    boolean not null default false,
  sort_order  integer not null default 0,
  active      boolean not null default true,
  created_at  timestamptz not null default now(),
  unique (category_id, code)
);

-- A choice question with no choices would render as a dead control.
alter table public.task_question_definitions
  drop constraint if exists task_question_definitions_select_has_options;
alter table public.task_question_definitions
  add constraint task_question_definitions_select_has_options
  check (input_kind <> 'select' or jsonb_array_length(options) > 0);

-- Access pattern: the active set for one category, in display order.
create index if not exists ix_task_question_definitions_category
  on public.task_question_definitions (category_id, sort_order)
  where active;

-- ---------------------------------------------------------------------------
-- 2. Answers
-- ---------------------------------------------------------------------------

create table if not exists public.task_answers (
  id          uuid primary key default gen_random_uuid(),
  task_id     uuid not null references public.tasks(id) on delete cascade,
  question_id uuid not null references public.task_question_definitions(id) on delete cascade,
  -- Answers are stored as text for every input kind (a boolean arrives as
  -- 'Yes'/'No', a number as its digits). The question's `input_kind` is what
  -- gives the value meaning, exactly as the UI collected it.
  answer      text not null check (char_length(answer) between 1 and 500),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  -- One answer per question per task; re-answering updates in place.
  unique (task_id, question_id)
);

create index if not exists ix_task_answers_task on public.task_answers (task_id);

drop trigger if exists trg_task_answers_updated_at on public.task_answers;
create trigger trg_task_answers_updated_at
  before update on public.task_answers
  for each row execute function app.set_updated_at();

-- ---------------------------------------------------------------------------
-- 3. Row Level Security
-- ---------------------------------------------------------------------------

-- Catalogue: readable by any authenticated user, exactly like `categories`.
-- Inactive rows stay visible to Admins so a retired question can still be
-- inspected against historical answers.
alter table public.task_question_definitions enable row level security;
drop policy if exists task_question_definitions_select on public.task_question_definitions;
create policy task_question_definitions_select on public.task_question_definitions
  for select to authenticated using (active or app.is_admin());

-- Answers follow the visibility of the task they describe — the same predicate
-- as `task_media`: public while the task is OPEN (so Taskers browsing the feed
-- can read the specifics they are quoting on), plus the owner, a confirmed
-- participant, or the assigned Admin.
alter table public.task_answers enable row level security;
drop policy if exists task_answers_select on public.task_answers;
create policy task_answers_select on public.task_answers
  for select to authenticated using (
    exists (select 1 from public.tasks t where t.id = task_id
            and (t.status = 'OPEN' or t.client_id = auth.uid()
                 or app.is_task_participant(t.id)))
    or app.admin_assigned_task(task_id)
  );

-- Only the task owner writes answers, and only while the task is still
-- editable (DRAFT/OPEN) — mirroring `tasks_update_own`. After a booking is
-- confirmed the answers are part of what was agreed and stop being editable.
drop policy if exists task_answers_write_own on public.task_answers;
create policy task_answers_write_own on public.task_answers
  for all to authenticated
  using (
    exists (select 1 from public.tasks t where t.id = task_id
            and t.client_id = auth.uid() and t.status in ('DRAFT', 'OPEN'))
  )
  with check (
    exists (select 1 from public.tasks t where t.id = task_id
            and t.client_id = auth.uid() and t.status in ('DRAFT', 'OPEN'))
  );

grant select on public.task_question_definitions to authenticated;
grant select, insert, update, delete on public.task_answers to authenticated;

-- ---------------------------------------------------------------------------
-- 4. Seed the question sets (idempotent upsert, keyed by category slug + code)
-- ---------------------------------------------------------------------------
--
-- The moving/removals set reproduces the reference flow's exact wording and
-- choices; the rest follow the same shape for the categories this platform
-- actually ships (see supabase/seed.sql).

with seed (cat_slug, code, label, input_kind, options, placeholder, required, sort_order) as (
  values
    -- Moving & Hauling
    ('moving-hauling'::text, 'what_moving'::text, 'What are you moving?'::text, 'select'::text,
     '["A few items","Apartment","House"]'::jsonb, null::text, true, 10),
    ('moving-hauling', 'stairs', 'Are there stairs?', 'select',
     '["No","At pickup","At delivery","At both places"]'::jsonb, null, true, 20),
    ('moving-hauling', 'key_items', 'What key items are you moving?', 'text',
     '[]'::jsonb, 'e.g. 2-seater sofa, fridge, 10 boxes', true, 30),
    ('moving-hauling', 'vehicle', 'Do you need a vehicle?', 'select',
     '["Just labour","Labour + vehicle","Not sure"]'::jsonb, null, false, 40),

    -- Home Cleaning
    ('home-cleaning', 'property_type', 'What type of place is it?', 'select',
     '["House","Apartment / Condo","Office"]'::jsonb, null, true, 10),
    ('home-cleaning', 'bedrooms', 'How many bedrooms?', 'select',
     '["Studio","1","2","3","4+"]'::jsonb, null, true, 20),
    ('home-cleaning', 'bathrooms', 'How many bathrooms?', 'select',
     '["1","2","3+"]'::jsonb, null, true, 30),
    ('home-cleaning', 'clean_type', 'What type of clean?', 'select',
     '["Standard","Deep clean","Move-out / End of lease"]'::jsonb, null, true, 40),
    ('home-cleaning', 'supplies', 'Will you provide cleaning supplies?', 'boolean',
     '[]'::jsonb, null, false, 50),

    -- Handyman & Repairs
    ('handyman', 'job_type', 'What needs doing?', 'select',
     '["Mount or hang something","Install a fixture","Repair something","Assemble furniture","Painting","Other"]'::jsonb,
     null, true, 10),
    ('handyman', 'key_items', 'What needs work?', 'text',
     '[]'::jsonb, 'e.g. wall-mount a 55" TV on concrete', true, 20),
    ('handyman', 'surface', 'What surface or wall type?', 'select',
     '["Drywall / plaster","Concrete / masonry","Timber","Not sure"]'::jsonb, null, false, 30),
    ('handyman', 'materials', 'Are materials or parts provided?', 'boolean',
     '[]'::jsonb, null, false, 40),

    -- Appliance Repair
    ('appliance-repair', 'appliance', 'Which appliance?', 'select',
     '["Aircon","Refrigerator","Washing machine","Oven / Stove","Water heater","Other"]'::jsonb,
     null, true, 10),
    ('appliance-repair', 'issue', 'What is the problem?', 'text',
     '[]'::jsonb, 'e.g. not cooling, leaking water', true, 20),
    ('appliance-repair', 'brand', 'Brand and model (if known)', 'text',
     '[]'::jsonb, 'e.g. Samsung WA75', false, 30),
    ('appliance-repair', 'unit_age', 'How old is the unit?', 'select',
     '["Under 1 year","1-3 years","3-5 years","5+ years","Not sure"]'::jsonb, null, false, 40),

    -- Gardening & Lawn
    ('gardening', 'yard_size', 'How big is the area?', 'select',
     '["Small","Medium","Large"]'::jsonb, null, true, 10),
    ('gardening', 'service', 'What do you need done?', 'select',
     '["Mowing","Weeding","Hedge or pruning","Landscaping","General cleanup"]'::jsonb, null, true, 20),
    ('gardening', 'green_waste', 'Do you need green waste removed?', 'boolean',
     '[]'::jsonb, null, false, 30),
    ('gardening', 'tools', 'Are tools provided?', 'boolean',
     '[]'::jsonb, null, false, 40),

    -- Tutoring
    ('tutoring', 'subject', 'What subject?', 'text',
     '[]'::jsonb, 'e.g. Grade 8 Algebra', true, 10),
    ('tutoring', 'level', 'What level?', 'select',
     '["Elementary","Junior High","Senior High","College","Adult"]'::jsonb, null, true, 20),
    ('tutoring', 'mode', 'In person or online?', 'select',
     '["In person","Online","Either"]'::jsonb, null, true, 30),
    ('tutoring', 'frequency', 'How often?', 'select',
     '["One-off session","Weekly","A few times a week"]'::jsonb, null, false, 40),

    -- Errands & Delivery
    ('errands', 'errand_type', 'What do you need?', 'select',
     '["Delivery","Pickup","Grocery run","Queue or line up","Other"]'::jsonb, null, true, 10),
    ('errands', 'route', 'Pickup and drop-off areas', 'text',
     '[]'::jsonb, 'e.g. Quezon City to Makati', true, 20),
    ('errands', 'item_size', 'How big is the item?', 'select',
     '["Small parcel","Large item","Multiple items","Not applicable"]'::jsonb, null, false, 30),
    ('errands', 'vehicle', 'Vehicle needed?', 'select',
     '["Motorcycle","Car","Van or truck","Not sure"]'::jsonb, null, false, 40),

    -- Tech Support
    ('tech-support', 'device', 'What device?', 'select',
     '["Laptop","Desktop PC","Printer","Wi-Fi / Network","Phone / Tablet","Other"]'::jsonb,
     null, true, 10),
    ('tech-support', 'issue', 'What is the problem?', 'text',
     '[]'::jsonb, 'e.g. will not connect to Wi-Fi', true, 20),
    ('tech-support', 'platform', 'Operating system', 'select',
     '["Windows","macOS","Linux","Android","iOS","Not sure"]'::jsonb, null, false, 30),
    ('tech-support', 'onsite', 'Does it need an on-site visit?', 'boolean',
     '[]'::jsonb, null, false, 40),

    -- -----------------------------------------------------------------------
    -- Live trending taxonomy (Removals, Cleaning, Painting, Repairs &
    -- Installations, Copywriting, Data Entry, Furniture Assembly). The join
    -- below simply skips any slug a given environment does not have, so this
    -- one migration seeds correctly whichever category set is installed.
    -- -----------------------------------------------------------------------

    -- Removals — reproduces the reference flow's exact wording and choices.
    ('removals', 'what_moving', 'What are you moving?', 'select',
     '["A few items","Apartment","House"]'::jsonb, null, true, 10),
    ('removals', 'stairs', 'Are there stairs?', 'select',
     '["No","At pickup","At delivery","At both places"]'::jsonb, null, true, 20),
    ('removals', 'key_items', 'What key items are you moving?', 'text',
     '[]'::jsonb, 'e.g. 2-seater sofa, fridge, 10 boxes', true, 30),
    ('removals', 'vehicle', 'Do you need a vehicle?', 'select',
     '["Just labour","Labour + vehicle","Not sure"]'::jsonb, null, false, 40),

    -- Cleaning
    ('cleaning', 'property_type', 'What type of place is it?', 'select',
     '["House","Apartment / Condo","Office"]'::jsonb, null, true, 10),
    ('cleaning', 'bedrooms', 'How many bedrooms?', 'select',
     '["Studio","1","2","3","4+"]'::jsonb, null, true, 20),
    ('cleaning', 'bathrooms', 'How many bathrooms?', 'select',
     '["1","2","3+"]'::jsonb, null, true, 30),
    ('cleaning', 'clean_type', 'What type of clean?', 'select',
     '["Standard","Deep clean","Move-out / End of lease"]'::jsonb, null, true, 40),
    ('cleaning', 'supplies', 'Will you provide cleaning supplies?', 'boolean',
     '[]'::jsonb, null, false, 50),

    -- Painting
    ('painting', 'what_painting', 'What needs painting?', 'select',
     '["Interior walls","Exterior walls","Ceiling","Doors & trim","Fence","Other"]'::jsonb,
     null, true, 10),
    ('painting', 'area', 'How big is the area?', 'select',
     '["1 room","2-3 rooms","Whole property","Exterior only"]'::jsonb, null, true, 20),
    ('painting', 'prep', 'Is surface prep or patching needed?', 'boolean',
     '[]'::jsonb, null, false, 30),
    ('painting', 'paint_supplied', 'Will you provide the paint?', 'boolean',
     '[]'::jsonb, null, false, 40),

    -- Repairs & Installations
    ('repairs-installations', 'job_type', 'What needs doing?', 'select',
     '["Mount or hang something","Install a fixture","Repair something","Plumbing","Electrical","Other"]'::jsonb,
     null, true, 10),
    ('repairs-installations', 'key_items', 'What needs work?', 'text',
     '[]'::jsonb, 'e.g. wall-mount a 55" TV on concrete', true, 20),
    ('repairs-installations', 'surface', 'What surface or wall type?', 'select',
     '["Drywall / plaster","Concrete / masonry","Timber","Not sure"]'::jsonb, null, false, 30),
    ('repairs-installations', 'materials', 'Are materials or parts provided?', 'boolean',
     '[]'::jsonb, null, false, 40),

    -- Copywriting
    ('copywriting', 'content_type', 'What type of content?', 'select',
     '["Website copy","Blog article","Product descriptions","Ad copy","Email","Other"]'::jsonb,
     null, true, 10),
    ('copywriting', 'brief', 'What is it about?', 'text',
     '[]'::jsonb, 'Topic, audience, and any must-have points', true, 20),
    ('copywriting', 'word_count', 'Roughly how many words?', 'number',
     '[]'::jsonb, 'e.g. 800', false, 30),
    ('copywriting', 'seo', 'Do you need SEO keywords included?', 'boolean',
     '[]'::jsonb, null, false, 40),

    -- Data Entry
    ('data-entry', 'data_type', 'What type of data entry?', 'select',
     '["Spreadsheet entry","PDF to spreadsheet","Product listings","Contact list","Other"]'::jsonb,
     null, true, 10),
    ('data-entry', 'volume', 'How many records or pages?', 'number',
     '[]'::jsonb, 'e.g. 250', true, 20),
    ('data-entry', 'source_format', 'Is the source digital or printed?', 'select',
     '["Digital files","Printed / scanned","Both"]'::jsonb, null, false, 30),
    ('data-entry', 'output_format', 'What format do you need back?', 'select',
     '["Excel","Google Sheets","CSV","Other"]'::jsonb, null, false, 40),

    -- Furniture Assembly
    ('furniture-assembly', 'item_type', 'What needs assembling?', 'select',
     '["Wardrobe","Bed","Desk or table","Shelving","Cabinet","Other"]'::jsonb, null, true, 10),
    ('furniture-assembly', 'item_count', 'How many items?', 'number',
     '[]'::jsonb, 'e.g. 3', true, 20),
    ('furniture-assembly', 'brand', 'Brand or flat-pack (if known)', 'text',
     '[]'::jsonb, 'e.g. IKEA PAX', false, 30),
    ('furniture-assembly', 'tools', 'Are tools provided?', 'boolean',
     '[]'::jsonb, null, false, 40),
    ('furniture-assembly', 'packaging', 'Do you need the packaging taken away?', 'boolean',
     '[]'::jsonb, null, false, 50)
)
insert into public.task_question_definitions
  (category_id, code, label, input_kind, options, placeholder, required, sort_order)
select c.id, s.code, s.label, s.input_kind, s.options, s.placeholder, s.required, s.sort_order
from seed s
join public.categories c on c.slug = s.cat_slug
on conflict (category_id, code) do update
  set label       = excluded.label,
      input_kind  = excluded.input_kind,
      options     = excluded.options,
      placeholder = excluded.placeholder,
      required    = excluded.required,
      sort_order  = excluded.sort_order,
      active      = true;
