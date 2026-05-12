"use client";

import { useState } from "react";
import { saveRequiredStaffCounts } from "@/app/actions/settings";

type WorkPattern = {
  id: string;
  name: string;
  start_time: string;
  end_time: string;
};

type RequiredCount = {
  work_pattern_id: string;
  day_type: "weekday" | "holiday";
  required_count: number;
};

type CountMap = Record<string, Record<"weekday" | "holiday", number>>;

function buildCountMap(patterns: WorkPattern[], counts: RequiredCount[]): CountMap {
  const map: CountMap = {};
  for (const p of patterns) {
    map[p.id] = { weekday: 0, holiday: 0 };
  }
  for (const c of counts) {
    if (map[c.work_pattern_id]) {
      map[c.work_pattern_id][c.day_type] = c.required_count;
    }
  }
  return map;
}

export default function RequiredStaffTab({
  patterns,
  counts,
}: {
  patterns: WorkPattern[];
  counts: RequiredCount[];
}) {
  const [countMap, setCountMap] = useState<CountMap>(() =>
    buildCountMap(patterns, counts)
  );
  const [loading, setLoading] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function setCount(patternId: string, dayType: "weekday" | "holiday", value: string) {
    const n = parseInt(value);
    setCountMap((prev) => ({
      ...prev,
      [patternId]: {
        ...prev[patternId],
        [dayType]: isNaN(n) ? 0 : Math.max(0, n),
      },
    }));
  }

  async function handleSave() {
    setLoading(true);
    setError(null);
    setSaved(false);
    const rows = patterns.flatMap((p) => [
      { work_pattern_id: p.id, day_type: "weekday" as const, required_count: countMap[p.id]?.weekday ?? 0 },
      { work_pattern_id: p.id, day_type: "holiday" as const, required_count: countMap[p.id]?.holiday ?? 0 },
    ]);
    try {
      await saveRequiredStaffCounts(rows);
      setSaved(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "保存に失敗しました");
    } finally {
      setLoading(false);
    }
  }

  if (patterns.length === 0) {
    return (
      <p className="text-sm text-gray-500">
        有効な勤務パターンがありません。先に「勤務パターン」タブで登録してください。
      </p>
    );
  }

  return (
    <div>
      <p className="text-sm text-gray-500 mb-4">
        勤務パターンごとに、平日・休日の必要人数を入力してください。
      </p>
      <div className="overflow-x-auto">
        <table className="bg-white rounded-lg shadow text-sm">
          <thead className="bg-gray-100 text-gray-600">
            <tr>
              <th className="px-4 py-3 text-left min-w-40">勤務パターン</th>
              <th className="px-4 py-3 text-center w-28">平日</th>
              <th className="px-4 py-3 text-center w-28">休日</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {patterns.map((p) => (
              <tr key={p.id}>
                <td className="px-4 py-3">
                  <div className="font-medium">{p.name}</div>
                  <div className="text-xs text-gray-400">
                    {p.start_time.slice(0, 5)}〜{p.end_time.slice(0, 5)}
                  </div>
                </td>
                <td className="px-4 py-3 text-center">
                  <input
                    type="number"
                    min={0}
                    value={countMap[p.id]?.weekday ?? 0}
                    onChange={(e) => setCount(p.id, "weekday", e.target.value)}
                    className="w-20 border rounded-md px-2 py-1 text-sm text-center focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </td>
                <td className="px-4 py-3 text-center">
                  <input
                    type="number"
                    min={0}
                    value={countMap[p.id]?.holiday ?? 0}
                    onChange={(e) => setCount(p.id, "holiday", e.target.value)}
                    className="w-20 border rounded-md px-2 py-1 text-sm text-center focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
      {saved && <p className="mt-3 text-sm text-green-600">保存しました</p>}
      <button
        onClick={handleSave}
        disabled={loading}
        className="mt-4 bg-blue-600 text-white px-4 py-2 rounded-md text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
      >
        {loading ? "保存中..." : "保存"}
      </button>
    </div>
  );
}
