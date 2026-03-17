-- ============================================================
-- DayAdapt — Supabase Schema
-- Run this in Supabase Dashboard → SQL Editor
-- ============================================================

-- Profiles (extends Supabase auth.users)
create table if not exists profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  email       text,
  name        text,
  location    jsonb,
  preferences jsonb,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- Wardrobe items
create table if not exists wardrobe_items (
  id                      text primary key,
  user_id                 uuid not null references auth.users(id) on delete cascade,
  name                    text not null check (char_length(trim(name)) > 0),
  description             text,
  category                text not null check (category in (
                            'top', 'bottom', 'footwear', 'accessory'
                          )),
  -- layer is only relevant for tops: 'inner' (t-shirt, shirt) or 'outer' (jacket, hoodie, cardigan)
  -- null for all non-top categories
  layer                   text check (layer is null or layer in ('inner', 'outer')),
  image_url               text not null default '',
  tags                    jsonb not null default '{}',
  times_worn_last_7_days  int  not null default 0 check (times_worn_last_7_days >= 0),
  times_worn_last_30_days int  not null default 0 check (times_worn_last_30_days >= 0),
  last_worn_date          date check (last_worn_date <= current_date),
  wear_history            jsonb not null default '[]',
  added_at                timestamptz not null default now()
);

create index if not exists wardrobe_items_user_id_idx      on wardrobe_items(user_id);
create index if not exists wardrobe_items_category_idx     on wardrobe_items(user_id, category);
create index if not exists wardrobe_items_layer_idx        on wardrobe_items(user_id, category, layer);
create index if not exists wardrobe_items_last_worn_idx    on wardrobe_items(user_id, last_worn_date);

-- Wear logs
create table if not exists wear_logs (
  id         text primary key,
  user_id    uuid not null references auth.users(id) on delete cascade,
  date       date not null check (date <= current_date + interval '1 day'),
  activity   text check (activity is null or activity in ('casual', 'work', 'gym', 'party')),
  item_ids   jsonb not null default '[]',
  created_at timestamptz not null default now()
);

create index if not exists wear_logs_user_date_idx on wear_logs(user_id, date desc);

-- ============================================================
-- Auto-update updated_at on profiles
-- ============================================================

create or replace function update_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists profiles_updated_at on profiles;
create trigger profiles_updated_at
  before update on profiles
  for each row execute function update_updated_at();

-- ============================================================
-- Row Level Security
-- ============================================================

alter table profiles       enable row level security;
alter table wardrobe_items enable row level security;
alter table wear_logs      enable row level security;

create policy "profiles: own row" on profiles
  for all using (auth.uid() = id);

create policy "wardrobe: own items" on wardrobe_items
  for all using (auth.uid() = user_id);

create policy "wear_logs: own logs" on wear_logs
  for all using (auth.uid() = user_id);

-- ============================================================
-- Storage bucket
-- Create in Supabase Dashboard → Storage → New bucket
--   Name: scans
--   Public: true
-- ============================================================