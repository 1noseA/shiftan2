-- work_patterns の RLS ポリシー整理
-- "for all" ポリシーは SELECT を含み "for select" と重複するうえ、
-- クライアントから manager が直接 DML できてしまう。
-- DML は service_role 経由の Server Actions のみに統一するため削除する。
drop policy if exists "work_patterns: manager は更新可" on public.work_patterns;
