import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import StaffList from "./StaffList";

export default async function StaffPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/auth/login");

  const [{ data: staff }, { data: departments }, { data: workPatterns }] = await Promise.all([
    supabase
      .from("employees")
      .select("id, last_name, first_name, email, role, employment_type, is_active, department_id, work_pattern_id, max_consecutive_workdays, max_workdays_per_month")
      .order("last_name"),
    supabase.from("departments").select("id, name").order("name"),
    supabase.from("work_patterns").select("id, name").eq("is_active", true).order("name"),
  ]);

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-5xl mx-auto">
        <h1 className="text-2xl font-semibold mb-6">スタッフ管理</h1>
        <StaffList
          staff={staff ?? []}
          departments={departments ?? []}
          workPatterns={workPatterns ?? []}
        />
      </div>
    </div>
  );
}
