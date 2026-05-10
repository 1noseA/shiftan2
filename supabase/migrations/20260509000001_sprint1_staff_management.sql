-- ============================================================
-- Sprint 1: スタッフ管理
-- stores / departments / work_patterns / employees
-- ============================================================

-- ----------------------------------------
-- Helper functions (RLS で再利用)
-- ----------------------------------------
create or replace function auth_role() returns text
language sql stable security definer as $$
  select role from public.employees where id = auth.uid()
$$;

create or replace function auth_store_id() returns uuid
language sql stable security definer as $$
  select store_id from public.employees where id = auth.uid()
$$;

create or replace function auth_department_id() returns uuid
language sql stable security definer as $$
  select department_id from public.employees where id = auth.uid()
$$;

-- ----------------------------------------
-- stores
-- ----------------------------------------
create table if not exists public.stores (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.stores add constraint stores_name_key unique (name);

alter table public.stores enable row level security;

create policy "stores: 認証ユーザーは参照可"
  on public.stores for select
  to authenticated
  using (true);

-- ----------------------------------------
-- departments
-- ----------------------------------------
create table if not exists public.departments (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.departments add constraint departments_name_key unique (name);

alter table public.departments enable row level security;

create policy "departments: 認証ユーザーは参照可"
  on public.departments for select
  to authenticated
  using (true);

-- ----------------------------------------
-- work_patterns
-- ----------------------------------------
create table if not exists public.work_patterns (
  id               uuid primary key default gen_random_uuid(),
  name             text not null,
  start_time       time not null,
  end_time         time not null,
  break_minutes    int  not null default 0,
  working_minutes  int  not null,
  is_active        bool not null default true,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
alter table public.work_patterns add constraint work_patterns_name_key unique (name);

alter table public.work_patterns enable row level security;

create policy "work_patterns: 認証ユーザーは参照可"
  on public.work_patterns for select
  to authenticated
  using (true);

-- manager のみ CRUD（service_role 経由の INSERT/UPDATE/DELETE を除く）
create policy "work_patterns: manager は更新可"
  on public.work_patterns for all
  to authenticated
  using (auth_role() = 'manager')
  with check (auth_role() = 'manager');

-- ----------------------------------------
-- employees
-- ----------------------------------------
create table if not exists public.employees (
  id                       uuid primary key references auth.users(id) on delete cascade,
  store_id                 uuid not null references public.stores(id),
  department_id            uuid references public.departments(id),
  email                    text not null,
  last_name                text not null,
  first_name               text not null,
  role                     text not null default 'staff',
  employment_type          text not null,
  max_workdays_per_month   int,
  max_consecutive_workdays int  not null default 4,
  work_pattern_id          uuid references public.work_patterns(id),
  is_active                bool not null default true,
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now(),

  constraint employees_email_key unique (email),
  constraint employees_role_check
    check (role in ('office', 'manager', 'staff')),
  constraint employees_employment_type_check
    check (employment_type in ('正社員', '契約社員', 'パート', 'アルバイト')),
  constraint employees_department_required
    check (role = 'office' or department_id is not null)
);

-- Indexes
create index if not exists employees_store_dept_active_idx
  on public.employees (store_id, department_id, is_active);

create index if not exists employees_work_pattern_idx
  on public.employees (work_pattern_id);

-- 1店舗に有効な office アカウントは1件まで
create unique index if not exists employees_one_active_office_per_store_idx
  on public.employees (store_id)
  where role = 'office' and is_active = true;

-- ----------------------------------------
-- employees RLS
-- INSERT / UPDATE / DELETE は service_role（Server Action）経由のみ。
-- RLS は SELECT のみ許可する。
-- ----------------------------------------
alter table public.employees enable row level security;

create policy "employees: office は自店舗を参照可"
  on public.employees for select
  to authenticated
  using (
    auth_role() = 'office'
    and store_id = auth_store_id()
  );

create policy "employees: manager は自店舗を参照可"
  on public.employees for select
  to authenticated
  using (
    auth_role() = 'manager'
    and store_id = auth_store_id()
  );

create policy "employees: staff は自部門を参照可"
  on public.employees for select
  to authenticated
  using (
    auth_role() = 'staff'
    and store_id = auth_store_id()
    and department_id = auth_department_id()
  );

-- ----------------------------------------
-- Auth → employees メール同期トリガ
-- ----------------------------------------
create or replace function public.sync_employee_email()
returns trigger
language plpgsql
security definer as $$
begin
  update public.employees
     set email = new.email,
         updated_at = now()
   where id = new.id;
  return new;
end;
$$;

drop trigger if exists trg_sync_employee_email on auth.users;
create trigger trg_sync_employee_email
  after update of email on auth.users
  for each row execute function public.sync_employee_email();

-- ----------------------------------------
-- Seed: 初期店舗・部門（開発用）
-- ----------------------------------------
insert into public.stores (name) values ('本店')
  on conflict (name) do nothing;

insert into public.departments (name) values ('青果'), ('精肉'), ('惣菜')
  on conflict (name) do nothing;
