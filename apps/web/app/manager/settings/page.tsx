import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import SettingsTabs from "./SettingsTabs";

type StaffRef = { id: string; last_name: string; first_name: string };
type Constraint = {
  id: string;
  staff_a_id: string;
  staff_b_id: string;
  reason: string | null;
  is_active: boolean;
  created_at: string;
  staff_a: StaffRef;
  staff_b: StaffRef;
};

export default async function SettingsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/auth/login");

  const { data: employee } = await supabase
    .from("employees")
    .select("role, store_id, department_id")
    .eq("id", user.id)
    .single();

  if (employee?.role !== "manager") redirect("/manager/dashboard");

  const storeId = employee.store_id as string;
  const deptId = employee.department_id as string;

  const [
    settingsRes,
    patternsRes,
    countsRes,
    autoGenRes,
    constraintsRes,
    staffRes,
  ] = await Promise.all([
    supabase.from("shift_settings").select("*").eq("id", 1).single(),
    supabase
      .from("work_patterns")
      .select("id, name, start_time, end_time, break_minutes, working_minutes, is_active")
      .order("start_time"),
    supabase
      .from("required_staff_counts")
      .select("work_pattern_id, day_type, required_count")
      .eq("store_id", storeId)
      .eq("department_id", deptId),
    supabase
      .from("auto_generation_settings")
      .select(
        "enable_day_off_hard, enable_max_consecutive, enable_workable_pattern, enable_relationship_soft, enable_fairness"
      )
      .eq("store_id", storeId)
      .eq("department_id", deptId)
      .single(),
    supabase
      .from("relationship_constraints")
      .select(
        "id, staff_a_id, staff_b_id, reason, is_active, created_at, staff_a:employees!staff_a_id(id, last_name, first_name), staff_b:employees!staff_b_id(id, last_name, first_name)"
      )
      .eq("store_id", storeId)
      .eq("department_id", deptId)
      .order("created_at", { ascending: false }),
    supabase
      .from("employees")
      .select("id, last_name, first_name")
      .eq("store_id", storeId)
      .eq("department_id", deptId)
      .eq("is_active", true)
      .not("work_pattern_id", "is", null)
      .order("last_name"),
  ]);

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-5xl mx-auto">
        <h1 className="text-2xl font-semibold mb-6">設定</h1>
        <SettingsTabs
          shiftSettings={settingsRes.data ?? null}
          workPatterns={patternsRes.data ?? []}
          requiredCounts={
            (countsRes.data ?? []) as {
              work_pattern_id: string;
              day_type: "weekday" | "holiday";
              required_count: number;
            }[]
          }
          autoGenSettings={autoGenRes.data ?? null}
          constraints={(constraintsRes.data ?? []) as unknown as Constraint[]}
          staffList={staffRes.data ?? []}
        />
      </div>
    </div>
  );
}
