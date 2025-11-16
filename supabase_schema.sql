-- USERS
create table if not exists users (
  id uuid primary key default gen_random_uuid(),
  nickname text not null unique,
  password_hash text not null,
  created_at timestamptz default now()
);

-- ROOMS
create table if not exists rooms (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  owner_id uuid not null references users(id) on delete cascade,
  password_hash text,
  created_at timestamptz default now(),
  current_turn_user_id uuid references users(id),
  current_map_id text,
  version integer default 1,
  is_locked boolean default false
);

-- ROOM PLAYERS
create table if not exists room_players (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references rooms(id) on delete cascade,
  user_id uuid not null references users(id) on delete cascade,
  joined_at timestamptz default now(),
  last_seen_at timestamptz default now(),
  is_in_room boolean default true
);

create index if not exists idx_room_players_room on room_players(room_id);

-- UNITS
create table if not exists units (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references rooms(id) on delete cascade,
  echelon_index integer not null default 0,
  type text not null,
  x numeric not null,
  y numeric not null,
  z_index bigint not null,
  symbol_name text,
  owner_user uuid references users(id),
  owner_slot integer default 0
);

create index if not exists idx_units_room_echelon on units(room_id, echelon_index);

-- DRAWINGS
create table if not exists drawings (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references rooms(id) on delete cascade,
  echelon_index integer not null default 0,
  type text not null,
  points jsonb not null,
  style jsonb
);

create index if not exists idx_drawings_room_echelon on drawings(room_id, echelon_index);

-- LOGS
create table if not exists logs (
  id bigint generated always as identity primary key,
  room_id text,
  user_id text,
  level text,
  message text,
  details jsonb,
  created_at timestamptz default now()
);

-- PLANS
create table if not exists plans (
  id uuid primary key default gen_random_uuid(),
  room_id text,
  user_id text,
  title text,
  data jsonb,
  created_at timestamptz default now()
);
