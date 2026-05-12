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

  const { data: caller } = await supabase
    .from("employees")
    .select("role, store_id")
    .eq("id", user.id)
    .single();
  if (caller?.role !== "manager") throw new Error("forbidden");

  return caller as { role: string; store_id: string };
}

const ALLOWED_ROLES = ["manager", "staff"] as const;
type AllowedRole = typeof ALLOWED_ROLES[number];

export async function inviteEmployee(formData: FormData) {
  const caller = await requireManager();
  const supabase = adminClient();

  const email = formData.get("email") as string;
  const lastName = formData.get("last_name") as string;
  const firstName = formData.get("first_name") as string;
  const roleRaw = formData.get("role") as string;
  if (!ALLOWED_ROLES.includes(roleRaw as AllowedRole)) throw new Error("invalid_role");
  const role = roleRaw as AllowedRole;
  const employmentType = formData.get("employment_type") as string;
  const departmentId = formData.get("department_id") as string | null;
  const workPatternId = formData.get("work_pattern_id") as string | null;
  const maxConsecutive = parseInt(formData.get("max_consecutive_workdays") as string) || 4;
  const maxWorkdays = formData.get("max_workdays_per_month")
    ? parseInt(formData.get("max_workdays_per_month") as string)
    : null;

  const { data: invited, error: inviteError } = await supabase.auth.admin.inviteUserByEmail(email);
  if (inviteError) throw new Error(inviteError.message);

  const { error: insertError } = await supabase.from("employees").insert({
    id: invited.user.id,
    store_id: caller.store_id,
    department_id: departmentId || null,
    email,
    last_name: lastName,
    first_name: firstName,
    role,
    employment_type: employmentType,
    max_consecutive_workdays: maxConsecutive,
    max_workdays_per_month: maxWorkdays,
    work_pattern_id: workPatternId || null,
  });
  if (insertError) {
    await supabase.auth.admin.deleteUser(invited.user.id);
    throw new Error(insertError.message);
  }

  revalidatePath("/manager/staff");
}

export async function updateEmployee(id: string, formData: FormData) {
  const caller = await requireManager();
  const supabase = adminClient();

  const { data: target } = await supabase
    .from("employees")
    .select("store_id")
    .eq("id", id)
    .single();
  if (target?.store_id !== caller.store_id) throw new Error("forbidden");

  const roleRaw = formData.get("role") as string;
  if (!ALLOWED_ROLES.includes(roleRaw as AllowedRole)) throw new Error("invalid_role");

  const { error } = await supabase.from("employees").update({
    last_name: formData.get("last_name") as string,
    first_name: formData.get("first_name") as string,
    role: roleRaw,
    employment_type: formData.get("employment_type") as string,
    department_id: (formData.get("department_id") as string) || null,
    work_pattern_id: (formData.get("work_pattern_id") as string) || null,
    max_consecutive_workdays: parseInt(formData.get("max_consecutive_workdays") as string) || 4,
    max_workdays_per_month: formData.get("max_workdays_per_month")
      ? parseInt(formData.get("max_workdays_per_month") as string)
      : null,
    updated_at: new Date().toISOString(),
  }).eq("id", id);

  if (error) throw new Error(error.message);
  revalidatePath("/manager/staff");
}

export async function deactivateEmployee(id: string) {
  const caller = await requireManager();
  const supabase = adminClient();

  const { data: target } = await supabase
    .from("employees")
    .select("store_id")
    .eq("id", id)
    .single();
  if (target?.store_id !== caller.store_id) throw new Error("forbidden");

  const { error } = await supabase
    .from("employees")
    .update({ is_active: false, updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath("/manager/staff");
}
