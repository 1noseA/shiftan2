"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

async function requireStaff() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("unauthorized");

  const { data: emp } = await supabase
    .from("employees")
    .select("role")
    .eq("id", user.id)
    .single();
  if (emp?.role !== "staff") throw new Error("forbidden");
  return { supabase, userId: user.id };
}

export async function toggleDayOff(targetDate: string, yearMonth: string) {
  if (!/^\d{4}-\d{2}$/.test(yearMonth)) throw new Error("invalid_date");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(targetDate)) throw new Error("invalid_date");
  if (!targetDate.startsWith(yearMonth)) throw new Error("invalid_date");

  const { supabase, userId } = await requireStaff();

  const { data: existing } = await supabase
    .from("day_off_requests")
    .select("id")
    .eq("staff_id", userId)
    .eq("target_date", targetDate)
    .maybeSingle();

  if (existing) {
    const { error } = await supabase
      .from("day_off_requests")
      .delete()
      .eq("id", existing.id);
    if (error) {
      if (error.code === "42501") throw new Error("deadline_passed");
      throw new Error(error.message);
    }
  } else {
    const todayJST = new Intl.DateTimeFormat("sv", { timeZone: "Asia/Tokyo" }).format(new Date());
    if (targetDate < todayJST) throw new Error("past_date");

    const [year, month] = yearMonth.split("-").map(Number);
    const lastDay = new Date(year, month, 0).getDate();

    const { count } = await supabase
      .from("day_off_requests")
      .select("id", { count: "exact", head: true })
      .eq("staff_id", userId)
      .gte("target_date", `${yearMonth}-01`)
      .lte("target_date", `${yearMonth}-${String(lastDay).padStart(2, "0")}`);

    const { data: settings } = await supabase
      .from("shift_settings")
      .select("day_off_max_per_month")
      .eq("id", 1)
      .single();

    if ((count ?? 0) >= (settings?.day_off_max_per_month ?? 3)) {
      throw new Error("max_days_exceeded");
    }

    const { error } = await supabase
      .from("day_off_requests")
      .insert({ staff_id: userId, target_date: targetDate });
    if (error) {
      if (error.code === "42501") throw new Error("deadline_passed");
      if (error.code === "23505") throw new Error("already_requested");
      if (error.code === "P0001") throw new Error("max_days_exceeded");
      throw new Error(error.message);
    }
  }

  revalidatePath("/staff/day-off");
}
