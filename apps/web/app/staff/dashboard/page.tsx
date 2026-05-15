import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import Link from "next/link";
import LogoutButton from "@/components/LogoutButton";

const MENU = [
  { href: "/staff/day-off", label: "希望休入力", description: "希望休の登録・確認" },
  { href: "/staff/shifts", label: "シフト一覧", description: "公開済みシフトを確認" },
];

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
