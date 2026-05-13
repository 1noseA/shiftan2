"use client";

import { useState, useOptimistic, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toggleDayOff } from "@/app/actions/day-off";

type Props = {
  yearMonth: string;
  requestedDates: string[];
  maxDays: number;
  deadlineDate: string;
};

const DAY_NAMES = ["月", "火", "水", "木", "金", "土", "日"];

export default function DayOffCalendar({
  yearMonth,
  requestedDates,
  maxDays,
  deadlineDate,
}: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [optimisticDates, updateOptimistic] = useOptimistic(
    requestedDates,
    (state: string[], toggledDate: string) =>
      state.includes(toggledDate)
        ? state.filter((d) => d !== toggledDate)
        : [...state, toggledDate]
  );
  const [error, setError] = useState<string | null>(null);

  const [year, month] = yearMonth.split("-").map(Number);
  const today = new Intl.DateTimeFormat("sv", { timeZone: "Asia/Tokyo" }).format(new Date());
  const isDeadlinePassed = today > deadlineDate;

  const daysInMonth = new Date(year, month, 0).getDate();
  const firstDayOfWeek = (new Date(year, month - 1, 1).getDay() + 6) % 7; // 0=Mon

  function handleNav(direction: -1 | 1) {
    const d = new Date(year, month - 1 + direction, 1);
    const ym = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    router.push(`/staff/day-off?ym=${ym}`);
  }

  function handleDayClick(dateStr: string) {
    if (isDeadlinePassed || dateStr < today) return;

    const isRequested = optimisticDates.includes(dateStr);
    if (!isRequested && optimisticDates.length >= maxDays) {
      setError(`希望休は月${maxDays}日までです`);
      return;
    }

    setError(null);
    startTransition(async () => {
      updateOptimistic(dateStr);
      try {
        await toggleDayOff(dateStr, yearMonth);
      } catch (err) {
        const msg = err instanceof Error ? err.message : "";
        if (msg === "deadline_passed") {
          setError("締切日を過ぎているため変更できません");
        } else if (msg === "max_days_exceeded") {
          setError(`希望休は月${maxDays}日までです`);
        } else {
          setError("エラーが発生しました。再度お試しください");
        }
      }
    });
  }

  const cells: (number | null)[] = [
    ...Array(firstDayOfWeek).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];

  const usedDays = optimisticDates.length;
  const remainingDays = Math.max(0, maxDays - usedDays);

  return (
    <div className="bg-white rounded-xl shadow p-4 sm:p-6">
      {/* Month navigation */}
      <div className="flex items-center justify-between mb-5">
        <button
          onClick={() => handleNav(-1)}
          className="w-9 h-9 flex items-center justify-center rounded-full hover:bg-gray-100 text-gray-600 text-xl"
        >
          ‹
        </button>
        <span className="text-lg font-semibold">
          {year}年{month}月
        </span>
        <button
          onClick={() => handleNav(1)}
          className="w-9 h-9 flex items-center justify-center rounded-full hover:bg-gray-100 text-gray-600 text-xl"
        >
          ›
        </button>
      </div>

      {/* Deadline and usage */}
      <div className="mb-4 p-3 bg-gray-50 rounded-lg space-y-1.5">
        <div className="flex justify-between text-sm">
          <span className="text-gray-500">入力締切</span>
          <span
            className={
              isDeadlinePassed
                ? "text-red-500 font-medium"
                : "text-gray-700 font-medium"
            }
          >
            {deadlineDate.replace(/-/g, "/")}
            {isDeadlinePassed ? "（締切済）" : ""}
          </span>
        </div>
        <div className="flex justify-between text-sm">
          <span className="text-gray-500">希望休</span>
          <span className="text-gray-700 font-medium">
            {usedDays} / {maxDays} 日（残り {remainingDays} 日）
          </span>
        </div>
      </div>

      {/* Day names */}
      <div className="grid grid-cols-7 mb-1">
        {DAY_NAMES.map((d, i) => (
          <div
            key={d}
            className={`text-center text-xs font-medium py-1 ${
              i === 5
                ? "text-blue-500"
                : i === 6
                ? "text-red-500"
                : "text-gray-400"
            }`}
          >
            {d}
          </div>
        ))}
      </div>

      {/* Calendar grid */}
      <div className="grid grid-cols-7 gap-1">
        {cells.map((day, idx) => {
          if (day === null) {
            return <div key={`empty-${idx}`} />;
          }

          const dateStr = `${yearMonth}-${String(day).padStart(2, "0")}`;
          const isRequested = optimisticDates.includes(dateStr);
          const isPastDate = dateStr < today;
          const isDisabled = isDeadlinePassed || isPastDate;
          const dayOfWeek = (firstDayOfWeek + day - 1) % 7; // 0=Mon, 5=Sat, 6=Sun

          return (
            <button
              key={day}
              onClick={() => handleDayClick(dateStr)}
              disabled={isDisabled || isPending}
              className={[
                "aspect-square flex items-center justify-center rounded-full text-sm font-medium transition-colors",
                isRequested
                  ? "bg-blue-500 text-white"
                  : isDisabled
                  ? "text-gray-200 cursor-not-allowed"
                  : dayOfWeek === 5
                  ? "text-blue-600 hover:bg-blue-50 cursor-pointer"
                  : dayOfWeek === 6
                  ? "text-red-600 hover:bg-red-50 cursor-pointer"
                  : "text-gray-700 hover:bg-gray-100 cursor-pointer",
              ]
                .filter(Boolean)
                .join(" ")}
            >
              {day}
            </button>
          );
        })}
      </div>

      {/* Error message */}
      {error && (
        <div className="mt-4 p-3 bg-red-50 text-red-600 text-sm rounded-lg">
          {error}
        </div>
      )}

      {isDeadlinePassed && (
        <p className="mt-4 text-xs text-gray-400 text-center">
          締切日を過ぎているため変更できません
        </p>
      )}
    </div>
  );
}
