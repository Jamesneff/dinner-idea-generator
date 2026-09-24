create table households (
  id uuid default gen_random_uuid() primary key,
  name text not null,
  emails text[] not null default '{}',
  access_token text not null unique default substr(md5(random()::text || clock_timestamp()::text), 1, 24),
  created_at timestamptz default now()
);

-- RLS stays locked down with no policies: the weekly script uses the service
-- role key (bypasses RLS) to manage households. The frontend never selects
-- from this table directly -- it only calls resolve_household_token below,
-- which returns id/name for a given token without exposing every
-- household's emails/tokens to anyone holding the public anon key.
alter table households enable row level security;

create function resolve_household_token(token text)
returns table (id uuid, name text)
language sql
security definer
set search_path = public
as $$
  select id, name from households where access_token = token;
$$;

grant execute on function resolve_household_token(text) to anon;

-- Backfill: the existing family becomes the first household
insert into households (name, emails)
values ('Neff Family', array['jamesneff07@gmail.com', 'janiceneff@yahoo.com']);

alter table meal_plans add column household_id uuid references households(id);
update meal_plans set household_id = (select id from households where name = 'Neff Family')
  where household_id is null;
alter table meal_plans alter column household_id set not null;

alter table custom_preferences add column household_id uuid references households(id);
update custom_preferences set household_id = (select id from households where name = 'Neff Family')
  where household_id is null;
alter table custom_preferences alter column household_id set not null;

-- These defaults used to live in the app's shared MEAL_PREFERENCES constant;
-- now that preferences are per-household, they move into this household's
-- own general_info so nothing is lost when the constant is trimmed down.
update custom_preferences
set general_info = trim(both E'\n' from general_info || E'\n' || $$
- Family of 4, no food allergies
- Avoid beef
- Dislike Indian food
- Enjoy fish and chicken primarily as meats
$$)
where household_id = (select id from households where name = 'Neff Family');

-- custom_preferences was a singleton keyed by id=1 (default 1); that default
-- would collide the moment a second household's row is inserted, so drop the
-- old id column entirely and key the table by household_id instead.
alter table custom_preferences drop constraint custom_preferences_pkey;
alter table custom_preferences drop column id;
alter table custom_preferences add primary key (household_id);
