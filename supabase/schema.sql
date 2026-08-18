-- ============================================================
-- ORDO PANEL — схема базы данных для Supabase (PostgreSQL)
-- Вставьте этот файл целиком в Supabase → SQL Editor → Run
-- ============================================================

-- Сотрудники (используем auth.users от Supabase Auth + свой профиль)
create table if not exists staff_profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null,
  created_at timestamptz not null default now()
);

-- Диалоги (переписки с клиентами)
create table if not exists dialogs (
  id uuid primary key default gen_random_uuid(),
  telegram_chat_id bigint not null unique,
  client_name text not null,
  client_username text,
  status text not null default 'new' check (status in ('new','waiting','in_progress','closed')),
  assigned_to uuid references staff_profiles(id) on delete set null,
  unread_count int not null default 0,
  last_message_preview text,
  last_message_at timestamptz not null default now(),
  draft_text text,
  is_bot_blocked boolean not null default false,
  created_at timestamptz not null default now()
);

-- Сообщения
create table if not exists messages (
  id uuid primary key default gen_random_uuid(),
  dialog_id uuid not null references dialogs(id) on delete cascade,
  sender_type text not null check (sender_type in ('client','staff','system')),
  staff_id uuid references staff_profiles(id) on delete set null,
  telegram_message_id bigint,
  telegram_update_id bigint,
  content_type text not null default 'text' check (content_type in ('text','photo','document','voice')),
  text_body text,
  file_url text,
  file_name text,
  caption text,
  reply_to_message_id uuid references messages(id) on delete set null,
  is_internal_note boolean not null default false,
  is_deleted boolean not null default false,
  send_status text not null default 'sent' check (send_status in ('sending','sent','failed')),
  error_message text,
  created_at timestamptz not null default now()
);

create unique index if not exists messages_telegram_dedup
  on messages(dialog_id, telegram_message_id)
  where telegram_message_id is not null;

-- Быстрые ответы (заготовки текста)
create table if not exists canned_replies (
  id uuid primary key default gen_random_uuid(),
  shortcut text not null unique,
  body text not null,
  created_by uuid references staff_profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

-- Метки
create table if not exists labels (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  color text not null default '#6b7280'
);

create table if not exists dialog_labels (
  dialog_id uuid not null references dialogs(id) on delete cascade,
  label_id uuid not null references labels(id) on delete cascade,
  primary key (dialog_id, label_id)
);

-- Напоминания
create table if not exists reminders (
  id uuid primary key default gen_random_uuid(),
  dialog_id uuid not null references dialogs(id) on delete cascade,
  staff_id uuid not null references staff_profiles(id) on delete cascade,
  remind_at timestamptz not null,
  note text,
  is_done boolean not null default false,
  created_at timestamptz not null default now()
);

-- Индексы для скорости
create index if not exists idx_messages_dialog on messages(dialog_id, created_at);
create index if not exists idx_dialogs_status on dialogs(status);
create index if not exists idx_dialogs_last_message on dialogs(last_message_at desc);

-- Включаем реальное время (Realtime) для нужных таблиц
alter publication supabase_realtime add table dialogs;
alter publication supabase_realtime add table messages;
alter publication supabase_realtime add table reminders;

-- Storage bucket для файлов
insert into storage.buckets (id, name, public)
values ('chat-files', 'chat-files', true)
on conflict (id) do nothing;

-- ============================================================
-- ROW LEVEL SECURITY
-- Панель закрытая: доступ есть только у вошедших сотрудников.
-- ============================================================
alter table staff_profiles enable row level security;
alter table dialogs enable row level security;
alter table messages enable row level security;
alter table canned_replies enable row level security;
alter table labels enable row level security;
alter table dialog_labels enable row level security;
alter table reminders enable row level security;

create policy "staff read own profile and others" on staff_profiles
  for select using (auth.role() = 'authenticated');

create policy "staff full access dialogs" on dialogs
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

create policy "staff full access messages" on messages
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

create policy "staff full access canned_replies" on canned_replies
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

create policy "staff full access labels" on labels
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

create policy "staff full access dialog_labels" on dialog_labels
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

create policy "staff full access reminders" on reminders
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

-- Готово. После выполнения этого файла:
-- 1. Storage → chat-files → сделайте bucket публичным (если не применилось выше)
-- 2. Authentication → Users → создайте 2 сотрудников вручную (email + пароль)
