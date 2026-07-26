-- 0005_messaging_notifications.sql
-- Conversations tied to confirmed bookings, messages, media, and notifications.

create table if not exists public.conversations (
  id         uuid primary key default gen_random_uuid(),
  booking_id uuid not null references public.bookings(id) on delete cascade,
  created_at timestamptz not null default now(),
  constraint uq_conversation_booking unique (booking_id)
);

create table if not exists public.conversation_participants (
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  user_id         uuid not null references public.profiles(id) on delete cascade,
  created_at      timestamptz not null default now(),
  primary key (conversation_id, user_id)
);

create index if not exists ix_conversation_participants_user
  on public.conversation_participants (user_id);

create table if not exists public.messages (
  id               uuid primary key default gen_random_uuid(),
  conversation_id  uuid not null references public.conversations(id) on delete cascade,
  sender_id        uuid not null references public.profiles(id),
  body             text check (body is null or char_length(body) <= 4000),
  moderation_status moderation_status not null default 'APPROVED',
  created_at       timestamptz not null default now(),
  edited_at        timestamptz
);

create index if not exists ix_messages_conversation on public.messages (conversation_id, created_at);

create table if not exists public.message_media (
  id          uuid primary key default gen_random_uuid(),
  message_id  uuid not null references public.messages(id) on delete cascade,
  storage_path text not null,
  kind        text not null check (kind in ('image', 'video')),
  mime_type   text not null,
  size_bytes  bigint not null check (size_bytes > 0 and size_bytes <= 104857600),
  created_at  timestamptz not null default now()
);

create index if not exists ix_message_media_message on public.message_media (message_id);

create table if not exists public.notifications (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references public.profiles(id) on delete cascade,
  type           text not null,
  title          text not null,
  body           text not null,
  resource_type  text,
  resource_id    uuid,
  read_at        timestamptz,
  delivery_status notification_delivery_status not null default 'PENDING',
  created_at     timestamptz not null default now()
);

create index if not exists ix_notifications_user on public.notifications (user_id, created_at desc);
create index if not exists ix_notifications_unread
  on public.notifications (user_id)
  where read_at is null;

create table if not exists public.notification_preferences (
  user_id  uuid not null references public.profiles(id) on delete cascade,
  category text not null check (category in
    ('verification', 'offers', 'bookings', 'payments', 'messages', 'disputes', 'system')),
  in_app   boolean not null default true,
  push     boolean not null default true,
  primary key (user_id, category)
);
