"use client";

import { useState } from "react";
import { upsertShiftSettings } from "@/app/actions/settings";

type ShiftSettings = {
  day_off_request_deadline_day: number;
  day_off_max_per_month: number;
  updated_at: string;
} | null;

export default function BasicSettingsTab({ settings }: { settings: ShiftSettings }) {
  const [deadline, setDeadline] = useState(
    String(settings?.day_off_request_deadline_day ?? 10)
  );
  const [maxDays, setMaxDays] = useState(
    String(settings?.day_off_max_per_month ?? 3)
  );
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
      await upsertShiftSettings(fd);
      setSaved(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "保存に失敗しました");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="max-w-md">
      <p className="text-sm text-gray-500 mb-6">全店共通の希望休ルールを設定します。</p>
      <form onSubmit={handleSubmit} className="space-y-5">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            希望休入力締切日（前月の何日まで）
          </label>
          <div className="flex items-center gap-2">
            <input
              name="day_off_request_deadline_day"
              type="number"
              min={1}
              max={28}
              value={deadline}
              onChange={(e) => setDeadline(e.target.value)}
              required
              className="w-24 border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <span className="text-sm text-gray-600">日</span>
          </div>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            月の希望休上限日数
          </label>
          <div className="flex items-center gap-2">
            <input
              name="day_off_max_per_month"
              type="number"
              min={1}
              value={maxDays}
              onChange={(e) => setMaxDays(e.target.value)}
              required
              className="w-24 border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <span className="text-sm text-gray-600">日</span>
          </div>
        </div>
        {error && <p className="text-sm text-red-600">{error}</p>}
        {saved && <p className="text-sm text-green-600">保存しました</p>}
        <div className="flex items-center gap-4">
          <button
            type="submit"
            disabled={loading}
            className="bg-blue-600 text-white px-4 py-2 rounded-md text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
          >
            {loading ? "保存中..." : "保存"}
          </button>
          {settings?.updated_at && (
            <span className="text-xs text-gray-400">
              最終更新: {new Date(settings.updated_at).toLocaleString("ja-JP")}
            </span>
          )}
        </div>
      </form>
    </div>
  );
}
