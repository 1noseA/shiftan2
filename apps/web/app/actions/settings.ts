"use server";

import { createClient as createUserClient } from "@/lib/supabase/server";
import { createClient } from "@supabase/supabase-js";
import { revalidatePath } from "next/cache";

function adminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}

async function requireManager() {
  const supabase = await createUserClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("unauthorized");

  const { data: emp } = await supabase
    .from("employees")
    .select("role, store_id, department_id")
    .eq("id", user.id)
    .single();
  if (emp?.role !== "manager") throw new Error("forbidden");
  return emp as { role: string; store_id: string; department_id: string };
}

// --- shift_settings ---

export async function upsertShiftSettings(formData: FormData) {
  await requireManager();
  const deadline = parseInt(formData.get("day_off_request_deadline_day") as string);
  const maxDays = parseInt(formData.get("day_off_max_per_month") as string);
  if (isNaN(deadline) || deadline < 1 || deadline > 28) throw new Error("invalid_deadline");
  if (isNaN(maxDays) || maxDays < 1 || maxDays > 31) throw new Error("invalid_max_days");

  const supabase = adminClient();
  const { error } = await supabase.from("shift_settings").upsert({
    id: 1,
    day_off_request_deadline_day: deadline,
    day_off_max_per_month: maxDays,
    updated_at: new Date().toISOString(),
  });
  if (error) throw new Error(error.message);
  revalidatePath("/manager/settings");
}

// --- required_staff_counts ---

export type RequiredStaffInput = {
  work_pattern_id: string;
  day_type: "weekday" | "holiday";
  required_count: number;
};

export async function saveRequiredStaffCounts(counts: RequiredStaffInput[]) {
  const emp = await requireManager();
  const supabase = adminClient();

  const rows = counts.map((c) => ({
    store_id: emp.store_id,
    department_id: emp.department_id,
    work_pattern_id: c.work_pattern_id,
    day_type: c.day_type,
    required_count: Math.max(0, c.required_count),
    updated_at: new Date().toISOString(),
  }));

  const { error } = await supabase
    .from("required_staff_counts")
    .upsert(rows, { onConflict: "store_id,department_id,day_type,work_pattern_id" });
  if (error) throw new Error(error.message);
  revalidatePath("/manager/settings");
}

// --- auto_generation_settings ---

export async function upsertAutoGenerationSettings(formData: FormData) {
  const emp = await requireManager();
  const supabase = adminClient();

  const { error } = await supabase.from("auto_generation_settings").upsert(
    {
      store_id: emp.store_id,
      department_id: emp.department_id,
      enable_day_off_hard: formData.get("enable_day_off_hard") === "on",
      enable_max_consecutive: formData.get("enable_max_consecutive") === "on",
      enable_workable_pattern: formData.get("enable_workable_pattern") === "on",
      enable_relationship_soft: formData.get("enable_relationship_soft") === "on",
      enable_fairness: formData.get("enable_fairness") === "on",
      updated_at: new Date().toISOString(),
    },
    { onConflict: "store_id,department_id" }
  );
  if (error) throw new Error(error.message);
  revalidatePath("/manager/settings");
}

// --- relationship_constraints ---

export async function createRelationshipConstraint(
  staffAId: string,
  staffBId: string,
  reason: string
) {
  const emp = await requireManager();
  if (!staffAId || !staffBId || staffAId === staffBId) throw new Error("invalid_staff_pair");
  const supabase = adminClient();

  const { error } = await supabase.from("relationship_constraints").insert({
    store_id: emp.store_id,
    department_id: emp.department_id,
    staff_a_id: staffAId,
    staff_b_id: staffBId,
    reason: reason.trim() || null,
    is_active: true,
  });
  if (error) {
    if (error.code === "23505") throw new Error("duplicate_pair");
    throw new Error(error.message);
  }
  revalidatePath("/manager/settings");
}

export async function toggleRelationshipConstraint(id: string, isActive: boolean) {
  const emp = await requireManager();
  const supabase = adminClient();

  const { error } = await supabase
    .from("relationship_constraints")
    .update({ is_active: isActive, updated_at: new Date().toISOString() })
    .eq("id", id)
    .eq("store_id", emp.store_id)
    .eq("department_id", emp.department_id);
  if (error) throw new Error(error.message);
  revalidatePath("/manager/settings");
}
