import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import WorkPatternList from "./WorkPatternList";

export default async function WorkPatternsPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/auth/login");

  const { data: patterns } = await supabase
    .from("work_patterns")
    .select("*")
    .order("start_time");

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-2xl font-semibold mb-6">勤務パターン設定</h1>
        <WorkPatternList patterns={patterns ?? []} />
      </div>
    </div>
  );
}
