"use client";

import { useState } from "react";
import { createWorkPattern, updateWorkPattern, toggleWorkPattern } from "@/app/actions/work-patterns";

type WorkPattern = {
  id: string;
  name: string;
  start_time: string;
  end_time: string;
  break_minutes: number;
  working_minutes: number;
  is_active: boolean;
};

const emptyForm = { name: "", start_time: "09:00", end_time: "17:00", break_minutes: "60" };

export default function WorkPatternList({ patterns }: { patterns: WorkPattern[] }) {
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<WorkPattern | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [loading, setLoading] = useState(false);

  function openCreate() {
    setEditing(null);
    setForm(emptyForm);
    setShowForm(true);
  }

  function openEdit(p: WorkPattern) {
    setEditing(p);
    setForm({
      name: p.name,
      start_time: p.start_time.slice(0, 5),
      end_time: p.end_time.slice(0, 5),
      break_minutes: String(p.break_minutes),
    });
    setShowForm(true);
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    const fd = new FormData(e.currentTarget);
    try {
      if (editing) {
        await updateWorkPattern(editing.id, fd);
      } else {
        await createWorkPattern(fd);
      }
      setShowForm(false);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div>
      <div className="flex justify-end mb-4">
        <button
          onClick={openCreate}
          className="bg-blue-600 text-white px-4 py-2 rounded-md text-sm font-medium hover:bg-blue-700"
        >
          ＋ 新規作成
        </button>
      </div>

      <table className="w-full bg-white rounded-lg shadow text-sm">
        <thead className="bg-gray-100 text-gray-600">
          <tr>
            <th className="px-4 py-3 text-left">パターン名</th>
            <th className="px-4 py-3 text-left">開始</th>
            <th className="px-4 py-3 text-left">終了</th>
            <th className="px-4 py-3 text-left">休憩</th>
            <th className="px-4 py-3 text-left">実働</th>
            <th className="px-4 py-3 text-left">状態</th>
            <th className="px-4 py-3" />
          </tr>
        </thead>
        <tbody className="divide-y">
          {patterns.map((p) => (
            <tr key={p.id} className={p.is_active ? "" : "opacity-50"}>
              <td className="px-4 py-3">{p.name}</td>
              <td className="px-4 py-3">{p.start_time.slice(0, 5)}</td>
              <td className="px-4 py-3">{p.end_time.slice(0, 5)}</td>
              <td className="px-4 py-3">{p.break_minutes}分</td>
              <td className="px-4 py-3">{p.working_minutes}分</td>
              <td className="px-4 py-3">{p.is_active ? "有効" : "無効"}</td>
              <td className="px-4 py-3 flex gap-2">
                <button
                  onClick={() => openEdit(p)}
                  className="text-blue-600 hover:underline"
                >
                  編集
                </button>
                <button
                  onClick={() => toggleWorkPattern(p.id, !p.is_active)}
                  className="text-gray-500 hover:underline"
                >
                  {p.is_active ? "無効化" : "有効化"}
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {showForm && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-lg p-6 w-full max-w-md">
            <h2 className="text-lg font-semibold mb-4">
              {editing ? "勤務パターン編集" : "勤務パターン新規作成"}
            </h2>
            <form onSubmit={handleSubmit} className="space-y-4">
              <Field label="パターン名" name="name" value={form.name} onChange={(v) => setForm({ ...form, name: v })} required />
              <Field label="開始時刻" name="start_time" type="time" value={form.start_time} onChange={(v) => setForm({ ...form, start_time: v })} required />
              <Field label="終了時刻" name="end_time" type="time" value={form.end_time} onChange={(v) => setForm({ ...form, end_time: v })} required />
              <Field label="休憩（分）" name="break_minutes" type="number" value={form.break_minutes} onChange={(v) => setForm({ ...form, break_minutes: v })} required />
              <div className="flex gap-3 justify-end pt-2">
                <button type="button" onClick={() => setShowForm(false)} className="text-sm text-gray-600 hover:underline">
                  キャンセル
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="bg-blue-600 text-white px-4 py-2 rounded-md text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
                >
                  {loading ? "保存中..." : "保存"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

function Field({
  label, name, value, onChange, type = "text", required = false,
}: {
  label: string; name: string; value: string;
  onChange: (v: string) => void; type?: string; required?: boolean;
}) {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>
      <input
        name={name}
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        required={required}
        className="w-full border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
      />
    </div>
  );
}
