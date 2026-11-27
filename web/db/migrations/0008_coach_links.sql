-- A coach link: a secret URL the runner gives an assistant that cannot connect over MCP (it only
-- opens links, or sends plain HTTP requests). Whoever holds it reads this runner's training and
-- plans workouts, until the runner disconnects it. Only the token's SHA-256 is kept, so the link
-- is shown once, when it is made.
create table coach_links (
  id uuid primary key default gen_random_uuid(),
  user_id text not null references "user" (id) on delete cascade,
  token_hash text not null unique,
  created_at timestamptz not null default now(),
  last_used_at timestamptz
);
create index coach_links_user_idx on coach_links (user_id);
