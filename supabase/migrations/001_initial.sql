create table meal_plans (
  id uuid default gen_random_uuid() primary key,
  week_start date not null,
  created_at timestamptz default now()
);

create table meals (
  id uuid default gen_random_uuid() primary key,
  meal_plan_id uuid references meal_plans(id) on delete cascade,
  day_of_week text not null,
  name text not null,
  description text not null,
  swapped boolean default false,
  created_at timestamptz default now()
);

create table feedback (
  id uuid default gen_random_uuid() primary key,
  meal_id uuid references meals(id) on delete cascade,
  rating integer check (rating between 1 and 5),
  made_it boolean default false,
  notes text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table meal_plans enable row level security;
alter table meals enable row level security;
alter table feedback enable row level security;

create policy "Public read" on meal_plans for select using (true);
create policy "Service insert" on meal_plans for insert with check (true);

create policy "Public read" on meals for select using (true);
create policy "Service insert" on meals for insert with check (true);
create policy "Public update" on meals for update using (true);

create policy "Public read" on feedback for select using (true);
create policy "Public insert" on feedback for insert with check (true);
create policy "Public update" on feedback for update using (true);
