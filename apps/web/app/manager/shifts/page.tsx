import Link from "next/link";
import { redirect } from "next/navigation";
import LogoutButton from "@/components/LogoutButton";
import ShiftBoard from "@/components/shifts/ShiftBoard";
import { createClient } from "@/lib/supabase/server";
import type {
  DayOffRequest,
  RequiredCount,
  ShiftAssignment,
  ShiftHeader,
  StaffMember,
  WorkPattern,
} from "@/lib/shifts";

export default async function ManagerShiftsPage({
  searchParams,
}: {
  searchParams: Promise<{ ym?: string }>;
}) {
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

  const { ym } = await searchParams;
  const today = new Date().toLocaleString("sv", { timeZone: "Asia/Tokyo" }).slice(0, 7);
  const yearMonth = ym && /^\d{4}-(0[1-9]|1[0-2])$/.test(ym) ? ym : today;
  const [year, month] = yearMonth.split("-").map(Number);
  const monthEnd = `${yearMonth}-${String(new Date(year, month, 0).getDate()).padStart(2, "0")}`;

  const storeId = employee.store_id as string;
  const departmentId = employee.department_id as string;

  const [patternsRes, requiredRes, staffRes, shiftRes] = await Promise.all([
    supabase
      .from("work_patterns")
      .select("id, name, start_time, end_time, is_active")
      .order("start_time"),
    supabase
      .from("required_staff_counts")
      .select("work_pattern_id, day_type, required_count")
      .eq("store_id", storeId)
      .eq("department_id", departmentId),
    supabase
      .from("employees")
      .select("id, last_name, first_name, work_pattern_id, max_consecutive_workdays")
      .eq("store_id", storeId)
      .eq("department_id", departmentId)
      .eq("is_active", true)
      .not("work_pattern_id", "is", null)
      .order("last_name"),
    supabase
      .from("shifts")
      .select("id, status, updated_at")
      .eq("store_id", storeId)
      .eq("department_id", departmentId)
      .eq("target_year_month", `${yearMonth}-01`)
      .maybeSingle(),
  ]);

  const staffList = (staffRes.data ?? []) as StaffMember[];
  const staffIds = staffList.map((staff) => staff.id);

  const [dayOffRes, assignmentsRes] = await Promise.all([
    staffIds.length > 0
      ? supabase
          .from("day_off_requests")
          .select("staff_id, target_date")
          .in("staff_id", staffIds)
          .gte("target_date", `${yearMonth}-01`)
          .lte("target_date", monthEnd)
      : Promise.resolve({ data: [] as DayOffRequest[] }),
    shiftRes.data
      ? supabase
          .from("shift_assignments")
          .select("id, target_date, work_pattern_id, staff_id, assignment_type")
          .eq("shift_id", shiftRes.data.id)
          .order("target_date")
      : Promise.resolve({ data: [] as ShiftAssignment[] }),
  ]);

  return (
    <div className="min-h-screen bg-gray-50 p-4 sm:p-8">
      <div className="mx-auto max-w-7xl">
        <div className="mb-6 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Link href="/manager/dashboard" className="text-gray-400 hover:text-gray-600">
              ←
            </Link>
            <h1 className="text-xl font-semibold text-gray-900">シフト一覧</h1>
          </div>
          <LogoutButton />
        </div>

        <ShiftBoard
          role="manager"
          basePath="/manager/shifts"
          yearMonth={yearMonth}
          shift={(shiftRes.data ?? null) as ShiftHeader | null}
          workPatterns={(patternsRes.data ?? []) as WorkPattern[]}
          staffList={staffList}
          requiredCounts={(requiredRes.data ?? []) as RequiredCount[]}
          dayOffRequests={(dayOffRes.data ?? []) as DayOffRequest[]}
          assignments={(assignmentsRes.data ?? []) as ShiftAssignment[]}
        />
      </div>
    </div>
  );
}
