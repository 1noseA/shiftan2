-- ============================================================
-- Sprint 3 追加: 希望休上限チェックトリガー（レース条件対策）
-- アプリ層の count→INSERT 間のレース条件を防ぐため、
-- INSERT 直前にスタッフ行を FOR UPDATE ロックして件数を再確認する
-- ============================================================

create or replace function check_day_off_max_per_month()
returns trigger language plpgsql security definer as $$
declare
  current_count integer;
  max_days integer;
begin
  -- 同一スタッフへの同時 INSERT を直列化するためスタッフ行をロック
  perform 1 from public.employees where id = NEW.staff_id for update;

  select day_off_max_per_month into max_days
  from public.shift_settings where id = 1;

  select count(*) into current_count
  from public.day_off_requests
  where staff_id = NEW.staff_id
    and date_trunc('month', target_date) = date_trunc('month', NEW.target_date);

  if current_count >= coalesce(max_days, 3) then
    raise exception 'max_days_exceeded' using errcode = 'P0001';
  end if;

  return NEW;
end;
$$;

create trigger day_off_max_per_month_check
  before insert on public.day_off_requests
  for each row execute function check_day_off_max_per_month();
