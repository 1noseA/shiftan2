"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { upsertAutoGenerationSettings } from "@/app/actions/settings";

type AutoGenSettings = {
  enable_day_off_hard: boolean;
  enable_max_consecutive: boolean;
  enable_workable_pattern: boolean;
  enable_relationship_soft: boolean;
  enable_fairness: boolean;
} | null;

const FLAGS = [
  {
    name: "enable_day_off_hard",
    label: "希望休をハード制約として扱う",
    description: "スタッフの希望休日には必ずシフトを入れない",
  },
  {
    name: "enable_max_consecutive",
    label: "最大連勤日数制約",
    description: "スタッフ個別の最大連勤日数を超えないよう制御する",
  },
  {
    name: "enable_workable_pattern",
    label: "勤務パターン制約",
    description: "スタッフに割り当てられた勤務パターンのみで生成する",
  },
  {
    name: "enable_relationship_soft",
    label: "人間関係ソフト制約",
    description: "人間関係制約を考慮してシフトを最適化する（同日同パターン回避）",
  },
  {
    name: "enable_fairness",
    label: "公平性考慮",
    description: "土日出勤・月間労働時間の偏りを最小化する",
  },
] as const;

export default function AutoGenerationTab({
  settings,
}: {
  settings: AutoGenSettings;
}) {
  const router = useRouter();
  const [flags, setFlags] = useState({
    enable_day_off_hard: settings?.enable_day_off_hard ?? true,
    enable_max_consecutive: settings?.enable_max_consecutive ?? false,
    enable_workable_pattern: settings?.enable_workable_pattern ?? false,
    enable_relationship_soft: settings?.enable_relationship_soft ?? false,
    enable_fairness: settings?.enable_fairness ?? false,
  });
  const [loading, setLoading] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setSaved(false);
    const fd = new FormData(e.currentTarget);
    try {
      await upsertAutoGenerationSettings(fd);
      router.refresh();
      setSaved(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "保存に失敗しました");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="max-w-lg">
      <p className="text-sm text-gray-500 mb-6">
        シフト自動生成時に有効にする制約を選択してください。
      </p>
      <form onSubmit={handleSubmit} className="space-y-4">
        {FLAGS.map((flag) => (
          <div key={flag.name} className="flex items-start gap-3 p-4 bg-white rounded-lg shadow">
            <input
              type="checkbox"
              id={flag.name}
              name={flag.name}
              checked={flags[flag.name]}
              onChange={(e) =>
                setFlags((prev) => ({ ...prev, [flag.name]: e.target.checked }))
              }
              className="mt-0.5 h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
            />
            <label htmlFor={flag.name} className="cursor-pointer">
              <div className="text-sm font-medium text-gray-700">{flag.label}</div>
              <div className="text-xs text-gray-400 mt-0.5">{flag.description}</div>
            </label>
          </div>
        ))}
        {error && <p className="text-sm text-red-600">{error}</p>}
        {saved && <p className="text-sm text-green-600">保存しました</p>}
        <button
          type="submit"
          disabled={loading}
          className="bg-blue-600 text-white px-4 py-2 rounded-md text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
        >
          {loading ? "保存中..." : "保存"}
        </button>
      </form>
    </div>
  );
}
