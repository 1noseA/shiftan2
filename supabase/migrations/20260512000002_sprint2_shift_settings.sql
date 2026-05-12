-- ============================================================
-- Sprint 2: シフト条件設定
-- shift_settings / required_staff_counts / auto_generation_settings / relationship_constraints
-- ============================================================

-- ----------------------------------------
-- shift_settings（全店共通シングルトン）
-- ----------------------------------------
create table if not exists public.shift_settings (
  id                           int primary key,
  day_off_request_deadline_day int not null default 10,
  day_off_max_per_month        int not null default 3,
  created_at                   timestamptz not null default now(),
  updated_at                   timestamptz not null default now(),
  constraint shift_settings_singleton check (id = 1)
);

-- シングルトン行の初期投入
insert into public.shift_settings (id) values (1)
  on conflict (id) do nothing;

alter table public.shift_settings enable row level security;

create policy "shift_settings: manager は参照可"
  on public.shift_settings for select
  to authenticated
  using (auth_role() = 'manager');

create policy "shift_settings: staff は参照可"
  on public.shift_settings for select
  to authenticated
  using (auth_role() = 'staff');

-- ----------------------------------------
-- required_staff_counts（店舗 × 部門 × 平日/休日 × 勤務パターン）
-- ----------------------------------------
create table if not exists public.required_staff_counts (
  id              uuid primary key default gen_random_uuid(),
  store_id        uuid not null references public.stores(id),
  department_id   uuid not null references public.departments(id),
  day_type        text not null,
  work_pattern_id uuid not null references public.work_patterns(id),
  required_count  int  not null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  constraint required_staff_counts_day_type_check
    check (day_type in ('weekday', 'holiday')),
  constraint required_staff_counts_unique
    unique (store_id, department_id, day_type, work_pattern_id),
  constraint required_staff_counts_count_check
    check (required_count >= 0)
);

alter table public.required_staff_counts enable row level security;

create policy "required_staff_counts: manager は自店舗自部門を操作可"
  on public.required_staff_counts for all
  to authenticated
  using (
    auth_role() = 'manager'
    and store_id = auth_store_id()
    and department_id = auth_department_id()
  )
  with check (
    auth_role() = 'manager'
    and store_id = auth_store_id()
    and department_id = auth_department_id()
  );

create policy "required_staff_counts: staff は自店舗を参照可"
  on public.required_staff_counts for select
  to authenticated
  using (
    auth_role() = 'staff'
    and store_id = auth_store_id()
  );

-- ----------------------------------------
-- auto_generation_settings（店舗 × 部門）
-- ----------------------------------------
create table if not exists public.auto_generation_settings (
  id                       uuid primary key default gen_random_uuid(),
  store_id                 uuid not null references public.stores(id),
  department_id            uuid not null references public.departments(id),
  enable_day_off_hard      bool not null default true,
  enable_max_consecutive   bool not null default false,
  enable_workable_pattern  bool not null default false,
  enable_relationship_soft bool not null default false,
  enable_fairness          bool not null default false,
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now(),
  constraint auto_generation_settings_unique
    unique (store_id, department_id)
);

alter table public.auto_generation_settings enable row level security;

create policy "auto_generation_settings: manager は自店舗自部門を操作可"
  on public.auto_generation_settings for all
  to authenticated
  using (
    auth_role() = 'manager'
    and store_id = auth_store_id()
    and department_id = auth_department_id()
  )
  with check (
    auth_role() = 'manager'
    and store_id = auth_store_id()
    and department_id = auth_department_id()
  );

create policy "auto_generation_settings: staff は自店舗を参照可"
  on public.auto_generation_settings for select
  to authenticated
  using (
    auth_role() = 'staff'
    and store_id = auth_store_id()
  );

-- ----------------------------------------
-- relationship_constraints（店舗 × 部門 × スタッフペア）
-- ----------------------------------------
create table if not exists public.relationship_constraints (
  id            uuid primary key default gen_random_uuid(),
  store_id      uuid not null references public.stores(id),
  department_id uuid not null references public.departments(id),
  staff_a_id    uuid not null references public.employees(id),
  staff_b_id    uuid not null references public.employees(id),
  reason        text,
  is_active     bool not null default true,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  constraint relationship_constraints_no_self_check
    check (staff_a_id <> staff_b_id)
);

-- ペア重複防止（A-B と B-A を同一ペアとして扱う）
create unique index if not exists relationship_constraints_pair_idx
  on public.relationship_constraints (
    store_id,
    department_id,
    least(staff_a_id, staff_b_id),
    greatest(staff_a_id, staff_b_id)
  );

create index if not exists relationship_constraints_dept_active_idx
  on public.relationship_constraints (store_id, department_id, is_active);

alter table public.relationship_constraints enable row level security;

create policy "relationship_constraints: manager は自店舗自部門を操作可"
  on public.relationship_constraints for all
  to authenticated
  using (
    auth_role() = 'manager'
    and store_id = auth_store_id()
    and department_id = auth_department_id()
  )
  with check (
    auth_role() = 'manager'
    and store_id = auth_store_id()
    and department_id = auth_department_id()
  );
