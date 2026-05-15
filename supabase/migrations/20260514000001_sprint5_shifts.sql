-- ============================================================
-- Sprint 5: シフト一覧・手動編集
-- shifts / shift_assignments / hand-edit RPCs
-- ============================================================

-- ----------------------------------------
-- shifts
-- ----------------------------------------
create table if not exists public.shifts (
  id                uuid primary key default gen_random_uuid(),
  target_year_month date not null,
  store_id          uuid not null references public.stores(id),
  department_id     uuid not null references public.departments(id),
  status            text not null default 'draft',
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  constraint shifts_unique unique (target_year_month, store_id, department_id),
  constraint shifts_status_check
    check (status in ('draft', 'published')),
  constraint shifts_target_year_month_check
    check (extract(day from target_year_month) = 1)
);

create index if not exists shifts_store_dept_month_idx
  on public.shifts (store_id, department_id, target_year_month);

alter table public.shifts enable row level security;

create policy "shifts: manager は自店舗自部門を参照可"
  on public.shifts for select
  to authenticated
  using (
    auth_role() = 'manager'
    and store_id = auth_store_id()
    and department_id = auth_department_id()
  );

create policy "shifts: staff は自店舗自部門の公開分を参照可"
  on public.shifts for select
  to authenticated
  using (
    auth_role() = 'staff'
    and status = 'published'
    and store_id = auth_store_id()
    and department_id = auth_department_id()
  );

-- ----------------------------------------
-- shift_assignments
-- ----------------------------------------
create table if not exists public.shift_assignments (
  id              uuid primary key default gen_random_uuid(),
  shift_id        uuid not null references public.shifts(id) on delete cascade,
  target_date     date not null,
  work_pattern_id uuid not null references public.work_patterns(id),
  staff_id        uuid not null references public.employees(id),
  assignment_type text not null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  constraint shift_assignments_unique unique (shift_id, target_date, staff_id),
  constraint shift_assignments_assignment_type_check
    check (assignment_type in ('auto', 'manual'))
);

create index if not exists shift_assignments_shift_date_idx
  on public.shift_assignments (shift_id, target_date);

create index if not exists shift_assignments_staff_date_idx
  on public.shift_assignments (staff_id, target_date);

alter table public.shift_assignments enable row level security;

create policy "shift_assignments: manager は自店舗自部門のシフトを参照可"
  on public.shift_assignments for select
  to authenticated
  using (
    auth_role() = 'manager'
    and exists (
      select 1
      from public.shifts s
      where s.id = shift_assignments.shift_id
        and s.store_id = auth_store_id()
        and s.department_id = auth_department_id()
    )
  );

create policy "shift_assignments: staff は自店舗自部門の公開シフトを参照可"
  on public.shift_assignments for select
  to authenticated
  using (
    auth_role() = 'staff'
    and exists (
      select 1
      from public.shifts s
      where s.id = shift_assignments.shift_id
        and s.status = 'published'
        and s.store_id = auth_store_id()
        and s.department_id = auth_department_id()
    )
  );

-- ----------------------------------------
-- Helper: manager 権限の検証
-- ----------------------------------------
create or replace function public.assert_active_manager()
returns table (
  store_id uuid,
  department_id uuid
)
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
  select e.store_id, e.department_id
  from public.employees e
  where e.id = auth.uid()
    and e.role = 'manager'
    and e.is_active = true;

  if not found then
    raise exception 'forbidden' using errcode = 'P0005';
  end if;
end;
$$;

-- ----------------------------------------
-- RPC: 下書きシフトを確保
-- ----------------------------------------
create or replace function public.fn_ensure_shift_draft(
  p_target_year_month date
) returns public.shifts
language plpgsql
security definer
set search_path = public
as $$
declare
  v_store_id uuid;
  v_department_id uuid;
  v_shift public.shifts;
begin
  select store_id, department_id
    into v_store_id, v_department_id
  from public.assert_active_manager();

  if extract(day from p_target_year_month) <> 1 then
    raise exception 'invalid_target_year_month' using errcode = 'P0004';
  end if;

  insert into public.shifts (
    target_year_month,
    store_id,
    department_id,
    status
  ) values (
    p_target_year_month,
    v_store_id,
    v_department_id,
    'draft'
  )
  on conflict (target_year_month, store_id, department_id) do nothing
  returning * into v_shift;

  if v_shift.id is null then
    select *
      into v_shift
    from public.shifts
    where target_year_month = p_target_year_month
      and store_id = v_store_id
      and department_id = v_department_id;
  end if;

  return v_shift;
end;
$$;

-- ----------------------------------------
-- RPC: 割当追加・変更
-- ----------------------------------------
create or replace function public.fn_assign_shift(
  p_shift_id uuid,
  p_target_date date,
  p_work_pattern_id uuid,
  p_staff_id uuid,
  p_expected_updated_at timestamptz,
  p_assignment_id uuid default null
) returns public.shift_assignments
language plpgsql
security definer
set search_path = public
as $$
declare
  v_store_id uuid;
  v_department_id uuid;
  v_shift public.shifts;
  v_assignment public.shift_assignments;
  v_now timestamptz := now();
  v_staff_store_id uuid;
  v_staff_department_id uuid;
  v_staff_is_active bool;
  v_staff_has_pattern bool;
begin
  select store_id, department_id
    into v_store_id, v_department_id
  from public.assert_active_manager();

  select *
    into v_shift
  from public.shifts
  where id = p_shift_id
  for update;

  if v_shift.id is null then
    raise exception 'shift_not_found' using errcode = 'P0002';
  end if;

  if v_shift.store_id <> v_store_id or v_shift.department_id <> v_department_id then
    raise exception 'forbidden' using errcode = 'P0005';
  end if;

  if v_shift.updated_at <> p_expected_updated_at then
    raise exception 'optimistic_lock_conflict' using errcode = 'P0001';
  end if;

  if v_shift.status = 'published' then
    raise exception 'cannot_edit_published_shift' using errcode = 'P0006';
  end if;

  if date_trunc('month', p_target_date)::date <> v_shift.target_year_month then
    raise exception 'invalid_target_date' using errcode = 'P0004';
  end if;

  select e.store_id,
         e.department_id,
         e.is_active,
         e.work_pattern_id is not null
    into v_staff_store_id,
         v_staff_department_id,
         v_staff_is_active,
         v_staff_has_pattern
  from public.employees e
  where e.id = p_staff_id;

  if v_staff_store_id is null
     or v_staff_department_id is null
     or v_staff_store_id <> v_shift.store_id
     or v_staff_department_id <> v_shift.department_id
     or v_staff_is_active is not true
     or v_staff_has_pattern is not true then
    raise exception 'invalid_staff' using errcode = 'P0004';
  end if;

  if p_assignment_id is null then
    insert into public.shift_assignments (
      shift_id,
      target_date,
      work_pattern_id,
      staff_id,
      assignment_type,
      updated_at
    ) values (
      p_shift_id,
      p_target_date,
      p_work_pattern_id,
      p_staff_id,
      'manual',
      v_now
    )
    returning * into v_assignment;
  else
    update public.shift_assignments
       set target_date = p_target_date,
           work_pattern_id = p_work_pattern_id,
           staff_id = p_staff_id,
           assignment_type = 'manual',
           updated_at = v_now
     where id = p_assignment_id
       and shift_id = p_shift_id
    returning * into v_assignment;

    if v_assignment.id is null then
      raise exception 'assignment_not_found' using errcode = 'P0003';
    end if;
  end if;

  update public.shifts
     set updated_at = v_now
   where id = p_shift_id;

  return v_assignment;
end;
$$;

create or replace function public.fn_upsert_shift_assignment(
  p_shift_id uuid,
  p_target_date date,
  p_work_pattern_id uuid,
  p_staff_id uuid,
  p_expected_updated_at timestamptz,
  p_assignment_id uuid default null
) returns public.shift_assignments
language sql
security definer
set search_path = public
as $$
  select public.fn_assign_shift(
    p_shift_id,
    p_target_date,
    p_work_pattern_id,
    p_staff_id,
    p_expected_updated_at,
    p_assignment_id
  );
$$;

-- ----------------------------------------
-- RPC: 割当削除
-- ----------------------------------------
create or replace function public.fn_remove_assignment(
  p_assignment_id uuid,
  p_shift_id uuid,
  p_expected_updated_at timestamptz
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_store_id uuid;
  v_department_id uuid;
  v_shift public.shifts;
  v_now timestamptz := now();
  v_deleted_id uuid;
begin
  select store_id, department_id
    into v_store_id, v_department_id
  from public.assert_active_manager();

  select *
    into v_shift
  from public.shifts
  where id = p_shift_id
  for update;

  if v_shift.id is null then
    raise exception 'shift_not_found' using errcode = 'P0002';
  end if;

  if v_shift.store_id <> v_store_id or v_shift.department_id <> v_department_id then
    raise exception 'forbidden' using errcode = 'P0005';
  end if;

  if v_shift.updated_at <> p_expected_updated_at then
    raise exception 'optimistic_lock_conflict' using errcode = 'P0001';
  end if;

  if v_shift.status = 'published' then
    raise exception 'cannot_edit_published_shift' using errcode = 'P0006';
  end if;

  delete from public.shift_assignments
  where id = p_assignment_id
    and shift_id = p_shift_id
  returning id into v_deleted_id;

  if v_deleted_id is null then
    raise exception 'assignment_not_found' using errcode = 'P0003';
  end if;

  update public.shifts
     set updated_at = v_now
   where id = p_shift_id;
end;
$$;

create or replace function public.fn_delete_shift_assignment(
  p_assignment_id uuid,
  p_shift_id uuid,
  p_expected_updated_at timestamptz
) returns void
language sql
security definer
set search_path = public
as $$
  select public.fn_remove_assignment(
    p_assignment_id,
    p_shift_id,
    p_expected_updated_at
  );
$$;

-- ----------------------------------------
-- RPC: 公開切替
-- ----------------------------------------
create or replace function public.fn_publish_shift(
  p_shift_id uuid,
  p_expected_updated_at timestamptz,
  p_status text
) returns public.shifts
language plpgsql
security definer
set search_path = public
as $$
declare
  v_store_id uuid;
  v_department_id uuid;
  v_shift public.shifts;
  v_now timestamptz := now();
begin
  select store_id, department_id
    into v_store_id, v_department_id
  from public.assert_active_manager();

  if p_status not in ('draft', 'published') then
    raise exception 'invalid_status' using errcode = 'P0004';
  end if;

  select *
    into v_shift
  from public.shifts
  where id = p_shift_id
  for update;

  if v_shift.id is null then
    raise exception 'shift_not_found' using errcode = 'P0002';
  end if;

  if v_shift.store_id <> v_store_id or v_shift.department_id <> v_department_id then
    raise exception 'forbidden' using errcode = 'P0005';
  end if;

  if v_shift.updated_at <> p_expected_updated_at then
    raise exception 'optimistic_lock_conflict' using errcode = 'P0001';
  end if;

  update public.shifts
     set status = p_status,
         updated_at = v_now
   where id = p_shift_id
  returning * into v_shift;

  return v_shift;
end;
$$;

grant execute on function public.fn_ensure_shift_draft(date) to authenticated;
grant execute on function public.fn_assign_shift(uuid, date, uuid, uuid, timestamptz, uuid) to authenticated;
grant execute on function public.fn_upsert_shift_assignment(uuid, date, uuid, uuid, timestamptz, uuid) to authenticated;
grant execute on function public.fn_remove_assignment(uuid, uuid, timestamptz) to authenticated;
grant execute on function public.fn_delete_shift_assignment(uuid, uuid, timestamptz) to authenticated;
grant execute on function public.fn_publish_shift(uuid, timestamptz, text) to authenticated;
