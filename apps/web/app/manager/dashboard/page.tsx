import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import LogoutButton from "@/components/LogoutButton";

export default async function ManagerDashboard() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/auth/login");

  const { data: employee } = await supabase
    .from("employees")
    .select("last_name, first_name, role")
    .eq("id", user.id)
    .single();

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-4xl mx-auto">
        <div className="flex items-center justify-between mb-8">
          <h1 className="text-2xl font-semibold">管理者ダッシュボード</h1>
          <LogoutButton />
        </div>
        <p className="text-gray-600">
          ようこそ、{employee?.last_name} {employee?.first_name} さん
        </p>
        {/* Sprint 1 以降で各機能リンクを追加 */}
      </div>
    </div>
  );
}
