import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import Link from "next/link";
import LogoutButton from "@/components/LogoutButton";
import DayOffCalendar from "./DayOffCalendar";

export default async function StaffDayOffPage({
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
    .select("role")
    .eq("id", user.id)
    .single();
  if (employee?.role !== "staff") redirect("/manager/dashboard");

  const { ym } = await searchParams;
  const defaultYm = new Date().toLocaleString("sv", { timeZone: "Asia/Tokyo" }).slice(0, 7);
  const yearMonth = ym && /^\d{4}-\d{2}$/.test(ym) ? ym : defaultYm;
  const [year, month] = yearMonth.split("-").map(Number);

  const lastDay = new Date(year, month, 0).getDate();

  const [settingsRes, requestsRes] = await Promise.all([
    supabase
      .from("shift_settings")
      .select("day_off_request_deadline_day, day_off_max_per_month")
      .eq("id", 1)
      .single(),
    supabase
      .from("day_off_requests")
      .select("target_date")
      .eq("staff_id", user.id)
      .gte("target_date", `${yearMonth}-01`)
      .lte("target_date", `${yearMonth}-${String(lastDay).padStart(2, "0")}`),
  ]);

  const deadlineDay = settingsRes.data?.day_off_request_deadline_day ?? 10;
  const maxDays = settingsRes.data?.day_off_max_per_month ?? 3;

  const dl = new Date(month === 1 ? year - 1 : year, (month === 1 ? 12 : month - 1) - 1, deadlineDay);
  const deadlineDate = `${dl.getFullYear()}-${String(dl.getMonth() + 1).padStart(2, "0")}-${String(dl.getDate()).padStart(2, "0")}`;

  const requestedDates = (requestsRes.data ?? []).map(
    (r) => r.target_date as string
  );

  return (
    <div className="min-h-screen bg-gray-50 p-4 sm:p-8">
      <div className="max-w-sm mx-auto">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-2">
            <Link
              href="/staff/dashboard"
              className="text-gray-400 hover:text-gray-600"
            >
              ←
            </Link>
            <h1 className="text-xl font-semibold">希望休入力</h1>
          </div>
          <LogoutButton />
        </div>
        <DayOffCalendar
          yearMonth={yearMonth}
          requestedDates={requestedDates}
          maxDays={maxDays}
          deadlineDate={deadlineDate}
        />
      </div>
    </div>
  );
}
