import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import Link from "next/link";
import LogoutButton from "@/components/LogoutButton";

const MENU = [
  { href: "/manager/staff", label: "スタッフ管理", description: "スタッフ一覧・招待・編集" },
  { href: "/manager/settings", label: "設定", description: "シフト条件・必要人数・自動生成条件" },
  { href: "/manager/day-off", label: "希望休一覧", description: "自部門スタッフの希望休を確認" },
];

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
        <p className="text-gray-600 mb-8">
          ようこそ、{employee?.last_name} {employee?.first_name} さん
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {MENU.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="block bg-white rounded-lg shadow p-6 hover:shadow-md transition-shadow"
            >
              <div className="font-semibold text-gray-800 mb-1">{item.label}</div>
              <div className="text-sm text-gray-500">{item.description}</div>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
