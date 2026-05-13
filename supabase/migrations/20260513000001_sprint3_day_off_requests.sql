-- ============================================================
-- Sprint 3: 希望休入力
-- day_off_requests テーブル
-- ============================================================

-- ----------------------------------------
-- Helper: 希望休入力可否チェック（締切前かどうか）
-- target_date の対象月の入力締切日（前月のX日）を超えていなければ true
-- ----------------------------------------
create or replace function is_day_off_editable(target_date date) returns bool
language sql stable security definer as $$
  select (now() at time zone 'Asia/Tokyo')::date <=
    (date_trunc('month', target_date) - interval '1 month')::date
    + ((select day_off_request_deadline_day from public.shift_settings where id = 1) - 1)
      * interval '1 day'
$$;

-- ----------------------------------------
-- day_off_requests（希望休）
-- ----------------------------------------
create table if not exists public.day_off_requests (
  id          uuid primary key default gen_random_uuid(),
  staff_id    uuid not null references public.employees(id),
  target_date date not null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint day_off_requests_unique unique (staff_id, target_date)
);

create index if not exists day_off_requests_target_date_idx
  on public.day_off_requests (target_date);

alter table public.day_off_requests enable row level security;

-- Staff: 自分の希望休を参照可
create policy "day_off_requests: staff は自分の希望休を参照可"
  on public.day_off_requests for select
  to authenticated
  using (
    auth_role() = 'staff'
    and staff_id = auth.uid()
  );

-- Staff: 締切前に自分の希望休を登録可
create policy "day_off_requests: staff は締切前に自分の希望休を登録可"
  on public.day_off_requests for insert
  to authenticated
  with check (
    auth_role() = 'staff'
    and staff_id = auth.uid()
    and is_day_off_editable(target_date)
  );

-- Staff: 締切前に自分の希望休を削除可
create policy "day_off_requests: staff は締切前に自分の希望休を削除可"
  on public.day_off_requests for delete
  to authenticated
  using (
    auth_role() = 'staff'
    and staff_id = auth.uid()
    and is_day_off_editable(target_date)
  );

-- Manager: 自部門スタッフの希望休を全操作可（締切後も可）
create policy "day_off_requests: manager は自部門の希望休を操作可"
  on public.day_off_requests for all
  to authenticated
  using (
    auth_role() = 'manager'
    and exists (
      select 1 from public.employees e
      where e.id = day_off_requests.staff_id
        and e.store_id = auth_store_id()
        and e.department_id = auth_department_id()
    )
  )
  with check (
    auth_role() = 'manager'
    and exists (
      select 1 from public.employees e
      where e.id = day_off_requests.staff_id
        and e.store_id = auth_store_id()
        and e.department_id = auth_department_id()
    )
  );
