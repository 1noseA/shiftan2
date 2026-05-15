"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import type {
  DayOffRequest,
  RequiredCount,
  ShiftAssignment,
  ShiftHeader,
  ShiftStatus,
  StaffMember,
  WorkPattern,
} from "@/lib/shifts";
import {
  dayToDateString,
  formatShortDate,
  formatYearMonthLabel,
  fullName,
  getDayOfWeek,
  getDayType,
  monthDays,
  shiftDate,
} from "@/lib/shifts";
import { exportShiftToExcel } from "@/lib/excel";

type Props = {
  role: "manager" | "staff";
  basePath: string;
  yearMonth: string;
  shift: ShiftHeader | null;
  workPatterns: WorkPattern[];
  staffList: StaffMember[];
  requiredCounts: RequiredCount[];
  dayOffRequests: DayOffRequest[];
  assignments: ShiftAssignment[];
};

type ModalState = {
  targetDate: string;
  patternId: string;
  existingAssignment: ShiftAssignment | null;
};

const DOW_NAMES = ["日", "月", "火", "水", "木", "金", "土"];

export default function ShiftBoard(props: Props) {
  const router = useRouter();
  const supabase = createClient();
  const [view, setView] = useState<"pattern" | "staff">("pattern");
  const [editMode, setEditMode] = useState(false);
  const [modal, setModal] = useState<ModalState | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [isExporting, setIsExporting] = useState(false);

  const isManager = props.role === "manager";
  const days = monthDays(props.yearMonth);
  const visiblePatternIds = new Set<string>();
  const requiredCountMap = new Map<string, number>();

  for (const count of props.requiredCounts) {
    visiblePatternIds.add(count.work_pattern_id);
    requiredCountMap.set(`${count.day_type}:${count.work_pattern_id}`, count.required_count);
  }
  for (const assignment of props.assignments) {
    visiblePatternIds.add(assignment.work_pattern_id);
  }

  const visiblePatterns = props.workPatterns.filter(
    (pattern) => pattern.is_active || visiblePatternIds.has(pattern.id)
  );
  const currentShift = props.shift;

  const patternMap = new Map(props.workPatterns.map((pattern) => [pattern.id, pattern]));
  const staffMap = new Map(props.staffList.map((staff) => [staff.id, staff]));
  const dayOffSet = new Set(props.dayOffRequests.map((request) => `${request.staff_id}:${request.target_date}`));
  const assignmentsByCell = new Map<string, ShiftAssignment[]>();
  const assignmentByStaffDate = new Map<string, ShiftAssignment>();

  for (const assignment of props.assignments) {
    const cellKey = `${assignment.target_date}:${assignment.work_pattern_id}`;
    const staffDateKey = `${assignment.staff_id}:${assignment.target_date}`;
    const current = assignmentsByCell.get(cellKey) ?? [];
    current.push(assignment);
    assignmentsByCell.set(cellKey, current);
    assignmentByStaffDate.set(staffDateKey, assignment);
  }

  for (const row of assignmentsByCell.values()) {
    row.sort((left, right) => {
      const leftStaff = staffMap.get(left.staff_id);
      const rightStaff = staffMap.get(right.staff_id);
      return fullName(leftStaff ?? { last_name: "", first_name: "" }).localeCompare(
        fullName(rightStaff ?? { last_name: "", first_name: "" }),
        "ja"
      );
    });
  }

  let shortageTotal = 0;
  let excessTotal = 0;
  for (const day of days) {
    const dateString = dayToDateString(props.yearMonth, day);
    const dayType = getDayType(dateString);
    for (const pattern of visiblePatterns) {
      const required = requiredCountMap.get(`${dayType}:${pattern.id}`) ?? 0;
      const assigned = assignmentsByCell.get(`${dateString}:${pattern.id}`)?.length ?? 0;
      shortageTotal += Math.max(0, required - assigned);
      excessTotal += Math.max(0, assigned - required);
    }
  }

  function moveMonth(direction: -1 | 1) {
    const [year, month] = props.yearMonth.split("-").map(Number);
    const next = new Date(year, month - 1 + direction, 1);
    const ym = `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, "0")}`;
    router.push(`${props.basePath}?ym=${ym}`);
  }

  function openModal(targetDate: string, patternId: string, existingAssignment: ShiftAssignment | null) {
    if (!isManager || !editMode || !props.shift) return;
    setErrorMessage(null);
    setModal({ targetDate, patternId, existingAssignment });
  }

  async function ensureDraftShift() {
    if (!isManager) return;
    startTransition(async () => {
      const { error } = await supabase.rpc("fn_ensure_shift_draft", {
        p_target_year_month: `${props.yearMonth}-01`,
      });
      if (error) {
        setErrorMessage(mapRpcError(error.code, error.message));
        return;
      }
      router.refresh();
    });
  }

  async function toggleStatus(nextStatus: ShiftStatus) {
    if (!currentShift) return;
    const confirmed = window.confirm(
      nextStatus === "published"
        ? "このシフトを公開しますか？"
        : "このシフトを下書きに戻しますか？"
    );
    if (!confirmed) return;

    startTransition(async () => {
      const { error } = await supabase.rpc("fn_publish_shift", {
        p_shift_id: currentShift.id,
        p_expected_updated_at: currentShift.updated_at,
        p_status: nextStatus,
      });
      if (error) {
        setErrorMessage(mapRpcError(error.code, error.message));
        return;
      }
      setEditMode(false);
      router.refresh();
    });
  }

  async function assignStaff(staffId: string) {
    if (!currentShift || !modal) return;
    startTransition(async () => {
      const { error } = await supabase.rpc("fn_assign_shift", {
        p_shift_id: currentShift.id,
        p_target_date: modal.targetDate,
        p_work_pattern_id: modal.patternId,
        p_staff_id: staffId,
        p_expected_updated_at: currentShift.updated_at,
        p_assignment_id: modal.existingAssignment?.id ?? null,
      });
      if (error) {
        setErrorMessage(mapRpcError(error.code, error.message));
        return;
      }
      setModal(null);
      router.refresh();
    });
  }

  async function removeAssignment() {
    if (!currentShift || !modal?.existingAssignment) return;
    const confirmed = window.confirm("この割当を削除しますか？");
    if (!confirmed) return;

    const assignmentId = modal.existingAssignment.id;

    startTransition(async () => {
      const { error } = await supabase.rpc("fn_remove_assignment", {
        p_assignment_id: assignmentId,
        p_shift_id: currentShift.id,
        p_expected_updated_at: currentShift.updated_at,
      });
      if (error) {
        setErrorMessage(mapRpcError(error.code, error.message));
        return;
      }
      setModal(null);
      router.refresh();
    });
  }

  function getRequiredCount(dateString: string, patternId: string) {
    return requiredCountMap.get(`${getDayType(dateString)}:${patternId}`) ?? 0;
  }

  function candidateWarnings(staff: StaffMember, state: ModalState) {
    const warnings: string[] = [];
    const currentAssignmentId = state.existingAssignment?.id ?? null;
    const hasDayOff = dayOffSet.has(`${staff.id}:${state.targetDate}`);
    if (hasDayOff) warnings.push("希望休");

    const isPatternMismatch = staff.work_pattern_id !== state.patternId;
    if (isPatternMismatch) warnings.push("勤務パターン不一致");

    const assignedSameDay = props.assignments.some(
      (assignment) =>
        assignment.staff_id === staff.id &&
        assignment.target_date === state.targetDate &&
        assignment.id !== currentAssignmentId
    );
    if (assignedSameDay) warnings.push("同日別シフト");

    const limit = staff.max_consecutive_workdays ?? 4;
    if (limit > 0 && exceedsConsecutiveLimit(staff.id, state.targetDate, currentAssignmentId, limit)) {
      warnings.push("連勤超過");
    }

    return { warnings, assignedSameDay };
  }

  function exceedsConsecutiveLimit(
    staffId: string,
    targetDate: string,
    currentAssignmentId: string | null,
    limit: number
  ) {
    const workedDates = new Set<string>();
    for (const assignment of props.assignments) {
      if (assignment.staff_id !== staffId) continue;
      if (assignment.id === currentAssignmentId) continue;
      workedDates.add(assignment.target_date);
    }
    workedDates.add(targetDate);

    let streak = 1;
    let cursor = shiftDate(targetDate, -1);
    while (workedDates.has(cursor)) {
      streak += 1;
      cursor = shiftDate(cursor, -1);
    }

    cursor = shiftDate(targetDate, 1);
    while (workedDates.has(cursor)) {
      streak += 1;
      cursor = shiftDate(cursor, 1);
    }

    return streak > limit;
  }

  const modalPattern = modal ? patternMap.get(modal.patternId) : null;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <button
            onClick={() => moveMonth(-1)}
            className="flex h-10 w-10 items-center justify-center rounded-full border border-gray-200 bg-white text-xl text-gray-600 hover:bg-gray-50"
          >
            ‹
          </button>
          <div>
            <div className="text-lg font-semibold text-gray-900">{formatYearMonthLabel(props.yearMonth)}</div>
            <div className="text-sm text-gray-500">
              {props.shift
                ? `状態: ${props.shift.status === "published" ? "公開" : "下書き"}`
                : isManager
                ? "シフト未作成"
                : "公開済みシフトなし"}
            </div>
          </div>
          <button
            onClick={() => moveMonth(1)}
            className="flex h-10 w-10 items-center justify-center rounded-full border border-gray-200 bg-white text-xl text-gray-600 hover:bg-gray-50"
          >
            ›
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="flex rounded-lg bg-gray-100 p-1">
            {([
              ["pattern", "日付 × 勤務"],
              ["staff", "日付 × スタッフ"],
            ] as const).map(([value, label]) => (
              <button
                key={value}
                onClick={() => setView(value)}
                className={`rounded-md px-3 py-1.5 text-sm font-medium ${
                  view === value ? "bg-white text-gray-900 shadow-sm" : "text-gray-500"
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          {props.shift && (
            <button
              onClick={async () => {
                setIsExporting(true);
                try {
                  await exportShiftToExcel({
                    yearMonth: props.yearMonth,
                    staffList: props.staffList,
                    assignments: props.assignments,
                    workPatterns: props.workPatterns,
                    dayOffRequests: props.dayOffRequests,
                  });
                } finally {
                  setIsExporting(false);
                }
              }}
              disabled={isExporting}
              className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-60"
            >
              {isExporting ? "出力中..." : "Excel出力"}
            </button>
          )}

          {isManager && !props.shift && (
            <button
              onClick={ensureDraftShift}
              disabled={isPending}
              className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
            >
              下書きを作成
            </button>
          )}

          {isManager && props.shift && (
            <>
              <button
                onClick={() => setEditMode((current) => !current)}
                className={`rounded-lg px-4 py-2 text-sm font-medium ${
                  editMode
                    ? "bg-amber-100 text-amber-800"
                    : "border border-gray-300 bg-white text-gray-700"
                }`}
              >
                {editMode ? "読み取り専用に戻す" : "編集モード"}
              </button>
              <button
                onClick={() => toggleStatus(props.shift?.status === "published" ? "draft" : "published")}
                disabled={isPending}
                className={`rounded-lg px-4 py-2 text-sm font-medium text-white disabled:opacity-60 ${
                  props.shift.status === "published" ? "bg-gray-700" : "bg-emerald-600"
                }`}
              >
                {props.shift.status === "published" ? "非公開にする" : "公開する"}
              </button>
            </>
          )}
        </div>
      </div>

      {errorMessage && (
        <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          {errorMessage}
        </div>
      )}

      {props.shift && (
        <div className="flex flex-wrap gap-2 text-sm text-gray-600">
          <span className="rounded-full bg-white px-3 py-1 shadow-sm">
            不足スロット: <strong>{shortageTotal}</strong>
          </span>
          <span className="rounded-full bg-white px-3 py-1 shadow-sm">
            超過スロット: <strong>{excessTotal}</strong>
          </span>
          {isManager && editMode && (
            <span className="rounded-full bg-amber-50 px-3 py-1 text-amber-700 shadow-sm">
              編集モード中
            </span>
          )}
        </div>
      )}

      {!props.shift ? (
        <div className="rounded-2xl border border-dashed border-gray-300 bg-white px-6 py-12 text-center text-gray-500">
          {isManager
            ? "この月のシフトはまだありません。下書きを作成して手動で割当を開始できます。"
            : "この月は公開済みシフトがありません。"}
        </div>
      ) : view === "pattern" ? (
        <div className="overflow-x-auto rounded-2xl border border-gray-200 bg-white shadow-sm">
          <table className="min-w-full border-collapse text-sm">
            <thead>
              <tr className="bg-gray-50">
                <th className="sticky left-0 z-10 border-b border-r border-gray-200 bg-gray-50 px-4 py-3 text-left font-medium text-gray-600">
                  日付
                </th>
                {visiblePatterns.map((pattern) => (
                  <th
                    key={pattern.id}
                    className="min-w-[220px] border-b border-gray-200 px-4 py-3 text-left font-medium text-gray-600"
                  >
                    <div>{pattern.name}</div>
                    <div className="text-xs font-normal text-gray-400">
                      {pattern.start_time.slice(0, 5)} - {pattern.end_time.slice(0, 5)}
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {days.map((day) => {
                const dateString = dayToDateString(props.yearMonth, day);
                const dow = getDayOfWeek(dateString);
                const dateClass =
                  dow === 0 ? "text-red-600" : dow === 6 ? "text-blue-600" : "text-gray-700";

                return (
                  <tr key={dateString} className="align-top border-b border-gray-100">
                    <td className="sticky left-0 z-10 border-r border-gray-200 bg-white px-4 py-4">
                      <div className={`font-medium ${dateClass}`}>{formatShortDate(dateString)}</div>
                    </td>
                    {visiblePatterns.map((pattern) => {
                      const cellAssignments =
                        assignmentsByCell.get(`${dateString}:${pattern.id}`) ?? [];
                      const requiredCount = getRequiredCount(dateString, pattern.id);
                      const shortage = Math.max(0, requiredCount - cellAssignments.length);
                      const excess = Math.max(0, cellAssignments.length - requiredCount);

                      return (
                        <td key={`${dateString}:${pattern.id}`} className="px-4 py-3">
                          <div className="space-y-2">
                            <div className="flex flex-wrap items-center gap-2 text-xs">
                              <span className="rounded-full bg-gray-100 px-2 py-1 text-gray-600">
                                必要 {requiredCount}
                              </span>
                              {shortage > 0 && (
                                <span className="rounded-full bg-amber-100 px-2 py-1 font-medium text-amber-800">
                                  不足 {shortage}
                                </span>
                              )}
                              {excess > 0 && (
                                <span className="rounded-full bg-rose-100 px-2 py-1 font-medium text-rose-700">
                                  超過 {excess}
                                </span>
                              )}
                            </div>

                            <div className="flex flex-wrap gap-2">
                              {cellAssignments.map((assignment) => {
                                const staff = staffMap.get(assignment.staff_id);
                                const hasDayOff = dayOffSet.has(`${assignment.staff_id}:${assignment.target_date}`);
                                return (
                                  <button
                                    key={assignment.id}
                                    onClick={() => openModal(dateString, pattern.id, assignment)}
                                    disabled={!isManager || !editMode}
                                    className={`rounded-full px-3 py-1.5 text-left text-xs font-medium ${
                                      hasDayOff
                                        ? "bg-rose-100 text-rose-700"
                                        : "bg-slate-100 text-slate-700"
                                    } disabled:cursor-default`}
                                  >
                                    {fullName(staff ?? { last_name: "不明", first_name: "" })}
                                    {hasDayOff && " !"}
                                  </button>
                                );
                              })}

                              {Array.from({ length: shortage }, (_, index) => (
                                <button
                                  key={`${dateString}:${pattern.id}:empty:${index}`}
                                  onClick={() => openModal(dateString, pattern.id, null)}
                                  disabled={!isManager || !editMode}
                                  className="rounded-full border border-dashed border-gray-300 px-3 py-1.5 text-xs text-gray-400 disabled:cursor-default"
                                >
                                  ＋
                                </button>
                              ))}

                              {isManager && editMode && (
                                <button
                                  onClick={() => openModal(dateString, pattern.id, null)}
                                  className="rounded-full border border-gray-200 px-3 py-1.5 text-xs text-gray-600"
                                >
                                  追加
                                </button>
                              )}
                            </div>
                          </div>
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-gray-200 bg-white shadow-sm">
          <table className="min-w-full border-collapse text-sm">
            <thead>
              <tr className="bg-gray-50">
                <th className="sticky left-0 z-10 border-b border-r border-gray-200 bg-gray-50 px-4 py-3 text-left font-medium text-gray-600">
                  スタッフ
                </th>
                {days.map((day) => {
                  const dateString = dayToDateString(props.yearMonth, day);
                  const dow = getDayOfWeek(dateString);
                  const dateClass =
                    dow === 0 ? "text-red-600" : dow === 6 ? "text-blue-600" : "text-gray-700";
                  return (
                    <th key={dateString} className={`border-b border-gray-200 px-2 py-3 text-center ${dateClass}`}>
                      <div>{day}</div>
                      <div className="text-xs font-normal">{DOW_NAMES[dow]}</div>
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {props.staffList.map((staff) => (
                <tr key={staff.id} className="border-b border-gray-100">
                  <td className="sticky left-0 z-10 border-r border-gray-200 bg-white px-4 py-3 font-medium text-gray-800">
                    {fullName(staff)}
                  </td>
                  {days.map((day) => {
                    const dateString = dayToDateString(props.yearMonth, day);
                    const assignment = assignmentByStaffDate.get(`${staff.id}:${dateString}`);
                    const pattern = assignment ? patternMap.get(assignment.work_pattern_id) : null;
                    const hasDayOff = dayOffSet.has(`${staff.id}:${dateString}`);
                    return (
                      <td
                        key={`${staff.id}:${dateString}`}
                        className={`px-2 py-3 text-center text-xs ${
                          hasDayOff && !assignment ? "bg-rose-50 text-rose-500" : "text-gray-600"
                        }`}
                      >
                        {pattern ? pattern.name : hasDayOff ? "休" : ""}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {modal && modalPattern && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 px-4">
          <div className="w-full max-w-2xl rounded-2xl bg-white shadow-2xl">
            <div className="flex items-start justify-between border-b border-gray-100 px-6 py-4">
              <div>
                <h2 className="text-lg font-semibold text-gray-900">
                  {modal.existingAssignment ? "割当の変更" : "スタッフを割り当て"}
                </h2>
                <p className="text-sm text-gray-500">
                  {formatShortDate(modal.targetDate)} / {modalPattern.name}
                </p>
              </div>
              <button onClick={() => setModal(null)} className="text-2xl text-gray-300">
                ×
              </button>
            </div>

            <div className="max-h-[70vh] overflow-y-auto px-6 py-4">
              <div className="space-y-3">
                {props.staffList.map((staff) => {
                  const { warnings, assignedSameDay } = candidateWarnings(staff, modal);
                  return (
                    <div
                      key={staff.id}
                      className="flex items-center justify-between gap-3 rounded-xl border border-gray-200 px-4 py-3"
                    >
                      <div>
                        <div className="font-medium text-gray-900">{fullName(staff)}</div>
                        <div className="mt-1 flex flex-wrap gap-1">
                          {warnings.length === 0 ? (
                            <span className="rounded-full bg-emerald-50 px-2 py-1 text-xs text-emerald-700">
                              警告なし
                            </span>
                          ) : (
                            warnings.map((warning) => (
                              <span
                                key={`${staff.id}:${warning}`}
                                className={`rounded-full px-2 py-1 text-xs ${
                                  warning === "同日別シフト"
                                    ? "bg-gray-200 text-gray-700"
                                    : "bg-amber-100 text-amber-800"
                                }`}
                              >
                                {warning}
                              </span>
                            ))
                          )}
                        </div>
                      </div>

                      <button
                        onClick={() => assignStaff(staff.id)}
                        disabled={isPending || assignedSameDay}
                        className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:bg-gray-300"
                      >
                        割り当て
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>

            {modal.existingAssignment && (
              <div className="flex items-center justify-between border-t border-gray-100 px-6 py-4">
                <button
                  onClick={removeAssignment}
                  disabled={isPending}
                  className="rounded-lg bg-rose-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
                >
                  削除
                </button>
                <button
                  onClick={() => setModal(null)}
                  className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700"
                >
                  閉じる
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function mapRpcError(code: string | undefined, message: string) {
  switch (code) {
    case "P0001":
      return "他のユーザーが更新しました。画面を再読込してからやり直してください。";
    case "P0002":
      return "対象のシフトが見つかりません。";
    case "P0003":
      return "対象の割当が見つかりません。";
    case "P0004":
      return "入力内容が不正です。対象年月・日付・スタッフを確認してください。";
    case "P0005":
    case "42501":
      return "この操作を実行する権限がありません。";
    case "P0006":
      return "公開済みシフトは編集できません。";
    case "23505":
      return "このスタッフは同日に別のシフトへ割り当て済みです。";
    default:
      return "更新に失敗しました。";
  }
}
