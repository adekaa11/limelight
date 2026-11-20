-- Supabase: SQL Editor -> вставить и выполнить один раз.

create table if not exists public.days (
  id              uuid primary key,
  date            date not null,
  title           text not null,
  text            text not null,
  photos          jsonb not null default '[]',   -- [url]
  song            jsonb,                          -- {title, artist, source_url, preview_url, analysis{...}}
  text_analysis   jsonb not null,
  photo_analysis  jsonb not null default '[]',
  style           jsonb not null,                 -- {technique, palette[5], grain, beat_step, motion, density, font_weight, caption}
  voice           jsonb not null,                 -- {name, rate, pitch, url}
  explanation     jsonb not null default '[]',    -- сработавшие правила
  folder          text not null,                  -- путь папки дня в bucket days
  video_url       text,
  meta            jsonb,
  created_at      timestamptz not null default now()
);

create index if not exists days_date_idx on public.days (date desc, created_at desc);

-- Бэкенд ходит с service_role ключом (RLS его не ограничивает).
-- Анонимный доступ к таблице закрыт: фронт читает только через наш API.
alter table public.days enable row level security;

-- Публичный bucket для файлов дня (фото, голос, превью песни, memory.webm)
insert into storage.buckets (id, name, public)
values ('days', 'days', true)
on conflict (id) do nothing;
