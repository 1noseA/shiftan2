import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import Link from "next/link";
import LogoutButton from "@/components/LogoutButton";
import DayOffList from "./DayOffList";

export default async function ManagerDayOffPage({
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
  if (employee?.role !== "manager") redirect("/");

  const storeId = employee.store_id;
  const deptId = employee.department_id;
  if (!storeId || !deptId) redirect("/");

  const { ym } = await searchParams;
  const today = new Date();
  const defaultYm = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}`;
  const yearMonth = ym && /^\d{4}-(0[1-9]|1[0-2])$/.test(ym) ? ym : defaultYm;
  const [year, month] = yearMonth.split("-").map(Number);
  const lastDay = new Date(year, month, 0).getDate();

  const staffRes = await supabase
    .from("employees")
    .select("id, last_name, first_name")
    .eq("store_id", storeId)
    .eq("department_id", deptId)
    .eq("is_active", true)
    .not("work_pattern_id", "is", null)
    .order("last_name");

  const staffList = staffRes.data ?? [];

  const requestsRes = await supabase
    .from("day_off_requests")
    .select("staff_id, target_date")
    .gte("target_date", `${yearMonth}-01`)
    .lte("target_date", `${yearMonth}-${String(lastDay).padStart(2, "0")}`)
    .in("staff_id", staffList.map((s) => s.id));

  const requests = (requestsRes.data ?? []) as {
    staff_id: string;
    target_date: string;
  }[];

  return (
    <div className="min-h-screen bg-gray-50 p-4 sm:p-8">
      <div className="max-w-5xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-2">
            <Link
              href="/manager/dashboard"
              className="text-gray-400 hover:text-gray-600"
            >
              ←
            </Link>
            <h1 className="text-xl font-semibold">希望休一覧</h1>
          </div>
          <LogoutButton />
        </div>
        <DayOffList
          yearMonth={yearMonth}
          staffList={staffList}
          requests={requests}
        />
      </div>
    </div>
  );
}
