-- The runner's phones, for one visible push when the coach plans or changes a workout. A token
-- is registered by the app on launch (and again when iOS changes it) and belongs to whoever
-- registered it last; APNs' 410 Unregistered removes it. `push_sent_at` is the debounce: at most
-- one push per user per 10 minutes, so planning a week does not send seven.
create table devices (
  id uuid primary key default gen_random_uuid(),
  user_id text not null references "user" (id) on delete cascade,
  token text not null unique,
  platform text not null check (platform in ('ios')),
  -- Debug builds of the app get sandbox tokens; APNs has a host for each.
  environment text not null check (environment in ('sandbox', 'production')),
  push_sent_at timestamptz,
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now()
);
create index devices_user_idx on devices (user_id);
