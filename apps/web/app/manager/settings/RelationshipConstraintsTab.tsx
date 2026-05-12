"use client";

import { useState } from "react";
import {
  createRelationshipConstraint,
  toggleRelationshipConstraint,
} from "@/app/actions/settings";

type StaffRef = { id: string; last_name: string; first_name: string };

type Constraint = {
  id: string;
  staff_a_id: string;
  staff_b_id: string;
  reason: string | null;
  is_active: boolean;
  created_at: string;
  staff_a: StaffRef;
  staff_b: StaffRef;
};

type Staff = { id: string; last_name: string; first_name: string };

function staffName(s: StaffRef) {
  return `${s.last_name} ${s.first_name}`;
}

export default function RelationshipConstraintsTab({
  constraints,
  staffList,
}: {
  constraints: Constraint[];
  staffList: Staff[];
}) {
  const [filter, setFilter] = useState<"all" | "active" | "inactive">("all");
  const [showModal, setShowModal] = useState(false);
  const [staffA, setStaffA] = useState("");
  const [staffB, setStaffB] = useState("");
  const [reason, setReason] = useState("");
  const [modalLoading, setModalLoading] = useState(false);
  const [modalError, setModalError] = useState<string | null>(null);
  const [togglingId, setTogglingId] = useState<string | null>(null);

  const filtered = constraints.filter((c) => {
    if (filter === "active") return c.is_active;
    if (filter === "inactive") return !c.is_active;
    return true;
  });

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setModalLoading(true);
    setModalError(null);
    try {
      await createRelationshipConstraint(staffA, staffB, reason);
      setShowModal(false);
      setStaffA("");
      setStaffB("");
      setReason("");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "登録に失敗しました";
      if (msg === "duplicate_pair") {
        setModalError(
          "このペアはすでに登録されています。無効化されている場合は一覧から再有効化してください。"
        );
      } else {
        setModalError(msg);
      }
    } finally {
      setModalLoading(false);
    }
  }

  async function handleToggle(id: string, current: boolean) {
    setTogglingId(id);
    try {
      await toggleRelationshipConstraint(id, !current);
    } finally {
      setTogglingId(null);
    }
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div className="flex gap-2">
          {(["all", "active", "inactive"] as const).map((v) => (
            <button
              key={v}
              onClick={() => setFilter(v)}
              className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                filter === v
                  ? "bg-blue-600 text-white"
                  : "bg-white text-gray-600 border hover:bg-gray-50"
              }`}
            >
              {v === "all" ? "すべて" : v === "active" ? "有効のみ" : "無効のみ"}
            </button>
          ))}
        </div>
        <button
          onClick={() => setShowModal(true)}
          className="bg-blue-600 text-white px-4 py-2 rounded-md text-sm font-medium hover:bg-blue-700"
        >
          ＋ 新規登録
        </button>
      </div>

      {filtered.length === 0 ? (
        <p className="text-sm text-gray-500 py-8 text-center">該当する制約がありません</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full bg-white rounded-lg shadow text-sm">
            <thead className="bg-gray-100 text-gray-600">
              <tr>
                <th className="px-4 py-3 text-left">スタッフA</th>
                <th className="px-4 py-3 text-left">スタッフB</th>
                <th className="px-4 py-3 text-left">理由</th>
                <th className="px-4 py-3 text-left">状態</th>
                <th className="px-4 py-3 text-left">登録日</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y">
              {filtered.map((c) => (
                <tr key={c.id} className={c.is_active ? "" : "opacity-50"}>
                  <td className="px-4 py-3">{staffName(c.staff_a)}</td>
                  <td className="px-4 py-3">{staffName(c.staff_b)}</td>
                  <td className="px-4 py-3 text-gray-500">{c.reason ?? "—"}</td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${
                        c.is_active
                          ? "bg-green-100 text-green-700"
                          : "bg-gray-100 text-gray-500"
                      }`}
                    >
                      {c.is_active ? "有効" : "無効"}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-gray-400">
                    {new Date(c.created_at).toLocaleDateString("ja-JP")}
                  </td>
                  <td className="px-4 py-3">
                    <button
                      onClick={() => handleToggle(c.id, c.is_active)}
                      disabled={togglingId === c.id}
                      className="text-sm text-gray-500 hover:underline disabled:opacity-50"
                    >
                      {c.is_active ? "無効化" : "有効化"}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-lg p-6 w-full max-w-md">
            <h2 className="text-lg font-semibold mb-4">人間関係制約の新規登録</h2>
            <p className="text-xs text-gray-500 mb-4">
              同一ペアの重複登録はできません。無効化されているペアは一覧から再有効化してください。
            </p>
            <form onSubmit={handleCreate} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  スタッフ A
                </label>
                <select
                  value={staffA}
                  onChange={(e) => setStaffA(e.target.value)}
                  required
                  className="w-full border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">選択してください</option>
                  {staffList.map((s) => (
                    <option key={s.id} value={s.id} disabled={s.id === staffB}>
                      {s.last_name} {s.first_name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  スタッフ B
                </label>
                <select
                  value={staffB}
                  onChange={(e) => setStaffB(e.target.value)}
                  required
                  className="w-full border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">選択してください</option>
                  {staffList.map((s) => (
                    <option key={s.id} value={s.id} disabled={s.id === staffA}>
                      {s.last_name} {s.first_name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  理由（任意）
                </label>
                <input
                  type="text"
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="例：トラブル履歴あり"
                  className="w-full border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              {modalError && <p className="text-sm text-red-600">{modalError}</p>}
              <div className="flex gap-3 justify-end pt-2">
                <button
                  type="button"
                  onClick={() => {
                    setShowModal(false);
                    setModalError(null);
                  }}
                  className="text-sm text-gray-600 hover:underline"
                >
                  キャンセル
                </button>
                <button
                  type="submit"
                  disabled={modalLoading}
                  className="bg-blue-600 text-white px-4 py-2 rounded-md text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
                >
                  {modalLoading ? "登録中..." : "登録"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
