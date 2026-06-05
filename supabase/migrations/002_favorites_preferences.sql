alter table meals add column favorited boolean default false;

create table custom_preferences (
  id integer primary key default 1,
  content text default '',
  updated_at timestamptz default now()
);

insert into custom_preferences (id, content) values (1, '');

alter table custom_preferences enable row level security;
create policy "Public read" on custom_preferences for select using (true);
create policy "Public insert" on custom_preferences for insert with check (true);
create policy "Public update" on custom_preferences for update using (true);
