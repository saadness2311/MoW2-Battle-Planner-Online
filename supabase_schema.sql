-- Supabase schema for MoW Battle Planner Online
-- This script creates all entities, constraints and RLS policies described in the brief.

-- Enable pgcrypto for UUID generation if not enabled
create extension if not exists "uuid-ossp";
create extension if not exists pgcrypto;

-- USERS / PROFILES -------------------------------------------------------
-- Supabase Auth stores users in auth.users. We keep a profile row with a unique nickname
-- and an optional role (creator / admin). Nickname is the only user-facing identifier.
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  nickname text not null unique check (char_length(nickname) >= 3),
  role text not null default 'player',
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

create policy "Users can see all profiles" on public.profiles
  for select using (auth.role() = 'authenticated');

create policy "Insert own profile" on public.profiles
  for insert with check (auth.uid() = id);

create policy "Update own profile" on public.profiles
  for update using (auth.uid() = id);

-- ROOMS ------------------------------------------------------------------
create table if not exists public.rooms (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  description text,
  password_hash text,
  owner_id uuid not null references public.profiles (id) on delete cascade,
  current_turn_user_id uuid references public.profiles (id),
  editing_user_id uuid references public.profiles (id),
  map_id text default 'map1',
  max_players integer not null default 50 check (max_players between 1 and 50),
  is_locked boolean default false,
  created_at timestamptz default now()
);

alter table public.rooms enable row level security;

create policy "Authenticated can read rooms" on public.rooms
  for select using (auth.role() = 'authenticated');

create policy "Owner can update room" on public.rooms
  for update using (auth.uid() = owner_id);

create policy "Owner can delete room" on public.rooms
  for delete using (auth.uid() = owner_id);

create policy "Anyone can create room" on public.rooms
  for insert with check (auth.uid() = owner_id);

create index if not exists rooms_owner_idx on public.rooms(owner_id);

-- ROOM USERS -------------------------------------------------------------
create table if not exists public.room_users (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.rooms(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  role text not null default 'spectator',
  is_active boolean default true,
  joined_at timestamptz default now(),
  last_seen_at timestamptz default now(),
  unique(room_id, user_id)
);

alter table public.room_users enable row level security;

create policy "Authenticated can see room users" on public.room_users
  for select using (auth.role() = 'authenticated');

create policy "Join room" on public.room_users
  for insert with check (auth.role() = 'authenticated' and auth.uid() = user_id);

create policy "Update own presence" on public.room_users
  for update using (auth.uid() = user_id);

create policy "Leave room" on public.room_users
  for delete using (auth.uid() = user_id);

create index if not exists room_users_room_idx on public.room_users(room_id);

-- ROOM PERMISSIONS -------------------------------------------------------
create table if not exists public.room_permissions (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.rooms(id) on delete cascade,
  editor_user_id uuid references public.profiles(id),
  updated_at timestamptz default now(),
  unique(room_id)
);

alter table public.room_permissions enable row level security;

create policy "Read permissions" on public.room_permissions
  for select using (auth.role() = 'authenticated');

create policy "Owner manages permissions" on public.room_permissions
  for insert with check (auth.uid() = (select owner_id from public.rooms where id = room_id));

create policy "Owner updates permissions" on public.room_permissions
  for update using (auth.uid() = (select owner_id from public.rooms where id = room_id));

-- ROOM STATE -------------------------------------------------------------
create table if not exists public.room_state (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.rooms(id) on delete cascade,
  map_id text default 'map1',
  echelon integer not null default 0,
  payload jsonb not null default '{}'::jsonb,
  version integer default 1,
  updated_at timestamptz default now(),
  unique(room_id, echelon)
);

alter table public.room_state enable row level security;
create policy "Read room state" on public.room_state
  for select using (auth.role() = 'authenticated');
create policy "Insert room state" on public.room_state
  for insert with check (auth.uid() = (select owner_id from public.rooms where id = room_id));

create policy "Update room state" on public.room_state
  for update using (auth.uid() = (select owner_id from public.rooms where id = room_id));

-- ROOM UNITS / MARKERS ---------------------------------------------------
create table if not exists public.room_units (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.rooms(id) on delete cascade,
  echelon integer not null default 0,
  team text check (team in ('blue','red')),
  slot integer,
  nickname text,
  symbol_key text not null,
  x numeric not null,
  y numeric not null,
  z_index bigint not null default 0,
  created_by uuid references public.profiles(id),
  created_at timestamptz default now()
);

create index if not exists room_units_room_idx on public.room_units(room_id, echelon);

alter table public.room_units enable row level security;

create policy "Read units" on public.room_units
  for select using (auth.role() = 'authenticated');

create policy "Insert units if editor" on public.room_units
  for insert with check (
    auth.role() = 'authenticated' and (
      auth.uid() = (select owner_id from public.rooms where id = room_id)
      or auth.uid() = (select editing_user_id from public.rooms where id = room_id)
      or auth.uid() = (select current_turn_user_id from public.rooms where id = room_id)
    )
  );

create policy "Update units if editor" on public.room_units
  for update using (
    auth.role() = 'authenticated' and (
      auth.uid() = (select owner_id from public.rooms where id = room_id)
      or auth.uid() = (select editing_user_id from public.rooms where id = room_id)
      or auth.uid() = (select current_turn_user_id from public.rooms where id = room_id)
    )
  );

create policy "Delete units if editor" on public.room_units
  for delete using (
    auth.role() = 'authenticated' and (
      auth.uid() = (select owner_id from public.rooms where id = room_id)
      or auth.uid() = (select editing_user_id from public.rooms where id = room_id)
      or auth.uid() = (select current_turn_user_id from public.rooms where id = room_id)
    )
  );

-- ROOM SYMBOLS (simple markers) -----------------------------------------
create table if not exists public.room_symbols (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.rooms(id) on delete cascade,
  echelon integer not null default 0,
  symbol_key text not null,
  x numeric not null,
  y numeric not null,
  created_by uuid references public.profiles(id),
  created_at timestamptz default now()
);

create index if not exists room_symbols_room_idx on public.room_symbols(room_id, echelon);

alter table public.room_symbols enable row level security;

create policy "Read symbols" on public.room_symbols
  for select using (auth.role() = 'authenticated');

create policy "Insert symbols if editor" on public.room_symbols
  for insert with check (
    auth.role() = 'authenticated' and (
      auth.uid() = (select owner_id from public.rooms where id = room_id)
      or auth.uid() = (select editing_user_id from public.rooms where id = room_id)
      or auth.uid() = (select current_turn_user_id from public.rooms where id = room_id)
    )
  );

create policy "Update symbols if editor" on public.room_symbols
  for update using (
    auth.role() = 'authenticated' and (
      auth.uid() = (select owner_id from public.rooms where id = room_id)
      or auth.uid() = (select editing_user_id from public.rooms where id = room_id)
      or auth.uid() = (select current_turn_user_id from public.rooms where id = room_id)
    )
  );

create policy "Delete symbols if editor" on public.room_symbols
  for delete using (
    auth.role() = 'authenticated' and (
      auth.uid() = (select owner_id from public.rooms where id = room_id)
      or auth.uid() = (select editing_user_id from public.rooms where id = room_id)
      or auth.uid() = (select current_turn_user_id from public.rooms where id = room_id)
    )
  );

-- ROOM DRAWINGS ---------------------------------------------------------
create table if not exists public.room_drawings (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.rooms(id) on delete cascade,
  echelon integer not null default 0,
  type text not null,
  points jsonb not null,
  style jsonb,
  created_by uuid references public.profiles(id),
  created_at timestamptz default now()
);

create index if not exists room_drawings_room_idx on public.room_drawings(room_id, echelon);

alter table public.room_drawings enable row level security;

create policy "Read drawings" on public.room_drawings
  for select using (auth.role() = 'authenticated');

create policy "Insert drawings if editor" on public.room_drawings
  for insert with check (
    auth.role() = 'authenticated' and (
      auth.uid() = (select owner_id from public.rooms where id = room_id)
      or auth.uid() = (select editing_user_id from public.rooms where id = room_id)
      or auth.uid() = (select current_turn_user_id from public.rooms where id = room_id)
    )
  );

create policy "Update drawings if editor" on public.room_drawings
  for update using (
    auth.role() = 'authenticated' and (
      auth.uid() = (select owner_id from public.rooms where id = room_id)
      or auth.uid() = (select editing_user_id from public.rooms where id = room_id)
      or auth.uid() = (select current_turn_user_id from public.rooms where id = room_id)
    )
  );

create policy "Delete drawings if editor" on public.room_drawings
  for delete using (
    auth.role() = 'authenticated' and (
      auth.uid() = (select owner_id from public.rooms where id = room_id)
      or auth.uid() = (select editing_user_id from public.rooms where id = room_id)
      or auth.uid() = (select current_turn_user_id from public.rooms where id = room_id)
    )
  );

-- CHAT ------------------------------------------------------------------
create table if not exists public.chat_messages (
  id bigint generated always as identity primary key,
  room_id uuid not null references public.rooms(id) on delete cascade,
  user_id uuid not null references public.profiles(id),
  content text not null check (char_length(content) > 0),
  created_at timestamptz default now()
);

create index if not exists chat_room_idx on public.chat_messages(room_id, created_at desc);

alter table public.chat_messages enable row level security;

create policy "Read chat" on public.chat_messages
  for select using (auth.role() = 'authenticated');

create policy "Insert chat" on public.chat_messages
  for insert with check (auth.role() = 'authenticated' and auth.uid() = user_id);

-- AUDIT LOGS ------------------------------------------------------------
create table if not exists public.action_logs (
  id bigint generated always as identity primary key,
  room_id uuid references public.rooms(id) on delete cascade,
  user_id uuid references public.profiles(id),
  action text,
  details jsonb,
  created_at timestamptz default now()
);

alter table public.action_logs enable row level security;
create policy "Read logs" on public.action_logs
  for select using (auth.role() = 'authenticated');
create policy "Insert logs" on public.action_logs
  for insert with check (auth.role() = 'authenticated');

-- Helper function to enforce single-room membership ---------------------
create or replace function public.assert_single_room_membership()
returns trigger as $$
begin
  if exists(select 1 from public.room_users ru where ru.user_id = new.user_id and ru.is_active = true and ru.room_id <> new.room_id) then
    raise exception 'User already active in another room';
  end if;
  return new;
end;
$$ language plpgsql;

create trigger trg_room_users_single_active
before insert on public.room_users
for each row execute procedure public.assert_single_room_membership();

-- Helpful realtime publication
alter publication supabase_realtime add table public.rooms, public.room_users, public.room_units, public.room_symbols, public.room_drawings, public.chat_messages, public.room_permissions;
