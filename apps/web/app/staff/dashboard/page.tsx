import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import LogoutButton from "@/components/LogoutButton";

export default async function StaffDashboard() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/auth/login");

  const { data: employee } = await supabase
    .from("employees")
    .select("last_name, first_name")
    .eq("id", user.id)
    .single();

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-4xl mx-auto">
        <div className="flex items-center justify-between mb-8">
          <h1 className="text-2xl font-semibold">マイページ</h1>
          <LogoutButton />
        </div>
        <p className="text-gray-600">
          ようこそ、{employee?.last_name} {employee?.first_name} さん
        </p>
        {/* Sprint 3 以降で希望休入力リンクを追加 */}
      </div>
    </div>
  );
}
