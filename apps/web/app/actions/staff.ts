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

export async function inviteEmployee(formData: FormData) {
  const supabase = adminClient();

  const email = formData.get("email") as string;
  const lastName = formData.get("last_name") as string;
  const firstName = formData.get("first_name") as string;
  const role = formData.get("role") as string;
  const employmentType = formData.get("employment_type") as string;
  const departmentId = formData.get("department_id") as string | null;
  const workPatternId = formData.get("work_pattern_id") as string | null;
  const maxConsecutive = parseInt(formData.get("max_consecutive_workdays") as string) || 4;
  const maxWorkdays = formData.get("max_workdays_per_month")
    ? parseInt(formData.get("max_workdays_per_month") as string)
    : null;

  // 店舗IDを取得（現状は1店舗固定）
  const { data: store } = await supabase
    .from("stores")
    .select("id")
    .single();
  if (!store) throw new Error("store_not_found");

  // Auth ユーザー招待
  const { data: invited, error: inviteError } = await supabase.auth.admin.inviteUserByEmail(email);
  if (inviteError) throw new Error(inviteError.message);

  // employees に挿入
  const { error: insertError } = await supabase.from("employees").insert({
    id: invited.user.id,
    store_id: store.id,
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
  if (insertError) throw new Error(insertError.message);

  revalidatePath("/manager/staff");
}

export async function updateEmployee(id: string, formData: FormData) {
  const supabase = adminClient();

  const { error } = await supabase.from("employees").update({
    last_name: formData.get("last_name") as string,
    first_name: formData.get("first_name") as string,
    role: formData.get("role") as string,
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
  const supabase = adminClient();
  const { error } = await supabase
    .from("employees")
    .update({ is_active: false, updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath("/manager/staff");
}
