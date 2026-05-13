"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type Staff = { id: string; last_name: string; first_name: string };
type Request = { staff_id: string; target_date: string };

type Props = {
  yearMonth: string;
  staffList: Staff[];
  requests: Request[];
};

const DOW_NAMES = ["日", "月", "火", "水", "木", "金", "土"];

export default function DayOffList({ yearMonth, staffList, requests }: Props) {
  const router = useRouter();
  const [view, setView] = useState<"staff" | "date">("staff");

  const [year, month] = yearMonth.split("-").map(Number);
  const daysInMonth = new Date(year, month, 0).getDate();
  const days = Array.from({ length: daysInMonth }, (_, i) => i + 1);

  function handleNav(direction: -1 | 1) {
    const d = new Date(year, month - 1 + direction, 1);
    const ym = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    router.push(`/manager/day-off?ym=${ym}`);
  }

  function dow(day: number) {
    return new Date(year, month - 1, day).getDay(); // 0=Sun, 6=Sat
  }
  function dowName(day: number) {
    return DOW_NAMES[dow(day)];
  }
  function dowClass(day: number) {
    const d = dow(day);
    return d === 0 ? "text-red-500" : d === 6 ? "text-blue-500" : "text-gray-600";
  }
  function cellBg(day: number) {
    const d = dow(day);
    return d === 0 ? "bg-red-50" : d === 6 ? "bg-blue-50" : "";
  }

  // staff_id → Set<date>
  const staffDateSet = new Map<string, Set<string>>();
  for (const r of requests) {
    if (!staffDateSet.has(r.staff_id)) staffDateSet.set(r.staff_id, new Set());
    staffDateSet.get(r.staff_id)!.add(r.target_date);
  }

  // date → staff names[]
  const dateStaffMap = new Map<string, string[]>();
  for (const r of requests) {
    const staff = staffList.find((s) => s.id === r.staff_id);
    if (!staff) continue;
    if (!dateStaffMap.has(r.target_date)) dateStaffMap.set(r.target_date, []);
    dateStaffMap.get(r.target_date)!.push(`${staff.last_name} ${staff.first_name}`);
  }

  return (
    <div>
      {/* Month navigation */}
      <div className="flex items-center justify-between mb-5">
        <button
          onClick={() => handleNav(-1)}
          className="w-9 h-9 flex items-center justify-center rounded-full hover:bg-gray-100 text-xl text-gray-600"
        >
          ‹
        </button>
        <span className="text-lg font-semibold">
          {year}年{month}月
        </span>
        <button
          onClick={() => handleNav(1)}
          className="w-9 h-9 flex items-center justify-center rounded-full hover:bg-gray-100 text-xl text-gray-600"
        >
          ›
        </button>
      </div>

      {/* View toggle */}
      <div className="flex gap-1 mb-5 bg-gray-100 rounded-lg p-1 w-fit">
        {(["staff", "date"] as const).map((v) => (
          <button
            key={v}
            onClick={() => setView(v)}
            className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${
              view === v
                ? "bg-white shadow text-gray-800"
                : "text-gray-500 hover:text-gray-700"
            }`}
          >
            {v === "staff" ? "スタッフ別" : "日付別"}
          </button>
        ))}
      </div>

      {staffList.length === 0 ? (
        <p className="text-center text-gray-400 py-16">
          シフト対象スタッフが登録されていません
        </p>
      ) : (
        <>
          {/* Staff view: heatmap */}
          {view === "staff" && (
            <div className="overflow-x-auto rounded-lg shadow">
              <table className="bg-white text-sm border-collapse">
                <thead>
                  <tr className="bg-gray-50">
                    <th className="sticky left-0 z-10 bg-gray-50 px-4 py-2 text-left text-gray-600 font-medium border-b border-r border-gray-200 min-w-[120px]">
                      スタッフ
                    </th>
                    {days.map((day) => (
                      <th
                        key={day}
                        className={`px-0 py-2 text-center font-medium border-b border-gray-200 w-8 min-w-[32px] ${dowClass(day)}`}
                      >
                        <div className="text-xs">{day}</div>
                        <div className="text-xs font-normal">{dowName(day)}</div>
                      </th>
                    ))}
                    <th className="px-3 py-2 text-center text-gray-600 font-medium border-b border-l border-gray-200 min-w-[40px]">
                      計
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {staffList.map((staff) => {
                    const dates = staffDateSet.get(staff.id) ?? new Set<string>();
                    return (
                      <tr key={staff.id} className="hover:bg-gray-50">
                        <td className="sticky left-0 z-10 bg-white px-4 py-2 font-medium text-gray-800 border-r border-gray-200 whitespace-nowrap">
                          {staff.last_name} {staff.first_name}
                        </td>
                        {days.map((day) => {
                          const dateStr = `${yearMonth}-${String(day).padStart(2, "0")}`;
                          return (
                            <td
                              key={day}
                              className={`text-center py-2 ${cellBg(day)}`}
                            >
                              {dates.has(dateStr) && (
                                <span className="inline-block w-4 h-4 bg-blue-500 rounded-full" />
                              )}
                            </td>
                          );
                        })}
                        <td className="px-3 py-2 text-center text-gray-700 border-l border-gray-200 font-medium">
                          {dates.size > 0 ? dates.size : ""}
                        </td>
                      </tr>
                    );
                  })}
                  {/* Count row */}
                  <tr className="bg-gray-50 border-t-2 border-gray-200">
                    <td className="sticky left-0 z-10 bg-gray-50 px-4 py-2 text-gray-500 text-xs border-r border-gray-200 font-medium">
                      希望休件数
                    </td>
                    {days.map((day) => {
                      const dateStr = `${yearMonth}-${String(day).padStart(2, "0")}`;
                      const count = (dateStaffMap.get(dateStr) ?? []).length;
                      return (
                        <td
                          key={day}
                          className={`text-center py-2 text-xs font-medium ${
                            count > 0 ? "text-gray-700" : "text-gray-300"
                          } ${cellBg(day)}`}
                        >
                          {count > 0 ? count : ""}
                        </td>
                      );
                    })}
                    <td className="px-3 py-2 text-center text-gray-700 border-l border-gray-200 font-medium text-xs">
                      {requests.length}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          )}

          {/* Date view */}
          {view === "date" && (
            <div className="bg-white rounded-lg shadow overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="px-4 py-3 text-left text-gray-600 font-medium w-28">
                      日付
                    </th>
                    <th className="px-4 py-3 text-left text-gray-600 font-medium">
                      希望休スタッフ
                    </th>
                    <th className="px-4 py-3 text-center text-gray-600 font-medium w-12">
                      件数
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {days.map((day) => {
                    const dateStr = `${yearMonth}-${String(day).padStart(2, "0")}`;
                    const names = dateStaffMap.get(dateStr) ?? [];
                    const d = dow(day);
                    const isSat = d === 6;
                    const isSun = d === 0;
                    return (
                      <tr
                        key={day}
                        className={
                          isSat
                            ? "bg-blue-50/40"
                            : isSun
                            ? "bg-red-50/40"
                            : ""
                        }
                      >
                        <td
                          className={`px-4 py-2.5 font-medium ${
                            isSat
                              ? "text-blue-600"
                              : isSun
                              ? "text-red-600"
                              : "text-gray-700"
                          }`}
                        >
                          {month}/{day}（{dowName(day)}）
                        </td>
                        <td className="px-4 py-2.5">
                          {names.length > 0 ? (
                            <div className="flex flex-wrap gap-1">
                              {names.map((name, i) => (
                                <span
                                  key={i}
                                  className="inline-flex items-center px-2 py-0.5 rounded-full text-xs bg-blue-100 text-blue-700"
                                >
                                  {name}
                                </span>
                              ))}
                            </div>
                          ) : (
                            <span className="text-gray-300 text-xs">なし</span>
                          )}
                        </td>
                        <td className="px-4 py-2.5 text-center font-medium text-gray-700">
                          {names.length > 0 ? names.length : ""}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  );
}
