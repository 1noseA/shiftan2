"use server";

import { createClient } from "@supabase/supabase-js";
import { revalidatePath } from "next/cache";

function adminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}

function calcWorkingMinutes(start: string, end: string, breakMin: number): number {
  const [sh, sm] = start.split(":").map(Number);
  const [eh, em] = end.split(":").map(Number);
  return (eh * 60 + em) - (sh * 60 + sm) - breakMin;
}

export async function createWorkPattern(formData: FormData) {
  const supabase = adminClient();
  const start = formData.get("start_time") as string;
  const end = formData.get("end_time") as string;
  const breakMin = parseInt(formData.get("break_minutes") as string) || 0;

  const { error } = await supabase.from("work_patterns").insert({
    name: formData.get("name") as string,
    start_time: start,
    end_time: end,
    break_minutes: breakMin,
    working_minutes: calcWorkingMinutes(start, end, breakMin),
  });
  if (error) throw new Error(error.message);
  revalidatePath("/manager/work-patterns");
}

export async function updateWorkPattern(id: string, formData: FormData) {
  const supabase = adminClient();
  const start = formData.get("start_time") as string;
  const end = formData.get("end_time") as string;
  const breakMin = parseInt(formData.get("break_minutes") as string) || 0;

  const { error } = await supabase.from("work_patterns").update({
    name: formData.get("name") as string,
    start_time: start,
    end_time: end,
    break_minutes: breakMin,
    working_minutes: calcWorkingMinutes(start, end, breakMin),
    updated_at: new Date().toISOString(),
  }).eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath("/manager/work-patterns");
}

export async function toggleWorkPattern(id: string, isActive: boolean) {
  const supabase = adminClient();
  const { error } = await supabase
    .from("work_patterns")
    .update({ is_active: isActive, updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath("/manager/work-patterns");
}
