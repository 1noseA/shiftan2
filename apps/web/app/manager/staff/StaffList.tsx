"use client";

import { useState } from "react";
import { inviteEmployee, updateEmployee, deactivateEmployee } from "@/app/actions/staff";

type Employee = {
  id: string;
  last_name: string;
  first_name: string;
  email: string;
  role: string;
  employment_type: string;
  is_active: boolean;
  department_id: string | null;
  work_pattern_id: string | null;
  max_consecutive_workdays: number;
  max_workdays_per_month: number | null;
};
type Dept = { id: string; name: string };
type WP   = { id: string; name: string };

const ROLES = ["manager", "staff"] as const;
const ETYPES = ["正社員", "契約社員", "パート", "アルバイト"] as const;

const emptyForm = {
  email: "", last_name: "", first_name: "",
  role: "staff", employment_type: "パート",
  department_id: "", work_pattern_id: "",
  max_consecutive_workdays: "4", max_workdays_per_month: "",
};

export default function StaffList({
  staff, departments, workPatterns,
}: {
  staff: Employee[]; departments: Dept[]; workPatterns: WP[];
}) {
  const [mode, setMode] = useState<"idle" | "invite" | "edit">("idle");
  const [editing, setEditing] = useState<Employee | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [loading, setLoading] = useState(false);
  const [showInactive, setShowInactive] = useState(false);

  const displayed = showInactive ? staff : staff.filter((s) => s.is_active);

  function openInvite() {
    setEditing(null);
    setForm(emptyForm);
    setMode("invite");
  }

  function openEdit(emp: Employee) {
    setEditing(emp);
    setForm({
      email: emp.email,
      last_name: emp.last_name,
      first_name: emp.first_name,
      role: emp.role,
      employment_type: emp.employment_type,
      department_id: emp.department_id ?? "",
      work_pattern_id: emp.work_pattern_id ?? "",
      max_consecutive_workdays: String(emp.max_consecutive_workdays),
      max_workdays_per_month: emp.max_workdays_per_month != null ? String(emp.max_workdays_per_month) : "",
    });
    setMode("edit");
  }

  async function handleInvite(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    try {
      await inviteEmployee(new FormData(e.currentTarget));
      setMode("idle");
    } finally {
      setLoading(false);
    }
  }

  async function handleUpdate(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!editing) return;
    setLoading(true);
    try {
      await updateEmployee(editing.id, new FormData(e.currentTarget));
      setMode("idle");
    } finally {
      setLoading(false);
    }
  }

  async function handleDeactivate(id: string) {
    if (!confirm("このスタッフを無効化しますか？")) return;
    await deactivateEmployee(id);
  }

  const deptName = (id: string | null) => departments.find((d) => d.id === id)?.name ?? "－";
  const wpName   = (id: string | null) => workPatterns.find((w) => w.id === id)?.name ?? "未設定";

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <label className="flex items-center gap-2 text-sm text-gray-600">
          <input type="checkbox" checked={showInactive} onChange={(e) => setShowInactive(e.target.checked)} />
          無効スタッフも表示
        </label>
        <button onClick={openInvite} className="bg-blue-600 text-white px-4 py-2 rounded-md text-sm font-medium hover:bg-blue-700">
          ＋ スタッフ招待
        </button>
      </div>

      <table className="w-full bg-white rounded-lg shadow text-sm">
        <thead className="bg-gray-100 text-gray-600">
          <tr>
            <th className="px-4 py-3 text-left">氏名</th>
            <th className="px-4 py-3 text-left">ロール</th>
            <th className="px-4 py-3 text-left">雇用区分</th>
            <th className="px-4 py-3 text-left">部門</th>
            <th className="px-4 py-3 text-left">勤務パターン</th>
            <th className="px-4 py-3 text-left">最大連勤</th>
            <th className="px-4 py-3" />
          </tr>
        </thead>
        <tbody className="divide-y">
          {displayed.map((emp) => (
            <tr key={emp.id} className={emp.is_active ? "" : "opacity-50"}>
              <td className="px-4 py-3">
                {emp.last_name} {emp.first_name}
                {!emp.is_active && <span className="ml-2 text-xs text-gray-400">（無効）</span>}
              </td>
              <td className="px-4 py-3">{emp.role}</td>
              <td className="px-4 py-3">{emp.employment_type}</td>
              <td className="px-4 py-3">{deptName(emp.department_id)}</td>
              <td className="px-4 py-3">{wpName(emp.work_pattern_id)}</td>
              <td className="px-4 py-3">{emp.max_consecutive_workdays}日</td>
              <td className="px-4 py-3 flex gap-2">
                <button onClick={() => openEdit(emp)} className="text-blue-600 hover:underline">編集</button>
                {emp.is_active && (
                  <button onClick={() => handleDeactivate(emp.id)} className="text-red-500 hover:underline">無効化</button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {(mode === "invite" || mode === "edit") && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-lg p-6 w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <h2 className="text-lg font-semibold mb-4">
              {mode === "invite" ? "スタッフ招待" : "スタッフ編集"}
            </h2>
            <form onSubmit={mode === "invite" ? handleInvite : handleUpdate} className="space-y-4">
              {mode === "invite" && (
                <Field label="メールアドレス" name="email" type="email" value={form.email} onChange={(v) => setForm({ ...form, email: v })} required />
              )}
              <div className="grid grid-cols-2 gap-3">
                <Field label="姓" name="last_name" value={form.last_name} onChange={(v) => setForm({ ...form, last_name: v })} required />
                <Field label="名" name="first_name" value={form.first_name} onChange={(v) => setForm({ ...form, first_name: v })} required />
              </div>
              <SelectField label="ロール" name="role" value={form.role} onChange={(v) => setForm({ ...form, role: v })} options={ROLES.map((r) => ({ value: r, label: r }))} />
              <SelectField label="雇用区分" name="employment_type" value={form.employment_type} onChange={(v) => setForm({ ...form, employment_type: v })} options={ETYPES.map((e) => ({ value: e, label: e }))} />
              <SelectField label="部門" name="department_id" value={form.department_id} onChange={(v) => setForm({ ...form, department_id: v })} options={[{ value: "", label: "未設定" }, ...departments.map((d) => ({ value: d.id, label: d.name }))]} />
              <SelectField label="勤務パターン" name="work_pattern_id" value={form.work_pattern_id} onChange={(v) => setForm({ ...form, work_pattern_id: v })} options={[{ value: "", label: "未設定" }, ...workPatterns.map((w) => ({ value: w.id, label: w.name }))]} />
              <Field label="最大連勤日数" name="max_consecutive_workdays" type="number" value={form.max_consecutive_workdays} onChange={(v) => setForm({ ...form, max_consecutive_workdays: v })} required />
              <Field label="月間最大勤務日数（任意）" name="max_workdays_per_month" type="number" value={form.max_workdays_per_month} onChange={(v) => setForm({ ...form, max_workdays_per_month: v })} />
              <div className="flex gap-3 justify-end pt-2">
                <button type="button" onClick={() => setMode("idle")} className="text-sm text-gray-600 hover:underline">キャンセル</button>
                <button type="submit" disabled={loading} className="bg-blue-600 text-white px-4 py-2 rounded-md text-sm font-medium hover:bg-blue-700 disabled:opacity-50">
                  {loading ? "送信中..." : mode === "invite" ? "招待メール送信" : "保存"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

function Field({ label, name, value, onChange, type = "text", required = false }: {
  label: string; name: string; value: string;
  onChange: (v: string) => void; type?: string; required?: boolean;
}) {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>
      <input name={name} type={type} value={value} onChange={(e) => onChange(e.target.value)} required={required}
        className="w-full border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
    </div>
  );
}

function SelectField({ label, name, value, onChange, options }: {
  label: string; name: string; value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>
      <select name={name} value={value} onChange={(e) => onChange(e.target.value)}
        className="w-full border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
        {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </div>
  );
}
