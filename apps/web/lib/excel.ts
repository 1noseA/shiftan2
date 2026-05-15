import type { DayOffRequest, ShiftAssignment, StaffMember, WorkPattern } from "@/lib/shifts";
import { dayToDateString, formatShortDate, fullName, monthDays } from "@/lib/shifts";

export async function exportShiftToExcel({
  yearMonth,
  staffList,
  assignments,
  workPatterns,
  dayOffRequests,
}: {
  yearMonth: string;
  staffList: StaffMember[];
  assignments: ShiftAssignment[];
  workPatterns: WorkPattern[];
  dayOffRequests: DayOffRequest[];
}) {
  const { utils, writeFile } = await import("xlsx");

  const days = monthDays(yearMonth);
  const patternMap = new Map(workPatterns.map((p) => [p.id, p.name]));
  const assignmentByStaffDate = new Map<string, ShiftAssignment>();
  const dayOffSet = new Set(dayOffRequests.map((r) => `${r.staff_id}:${r.target_date}`));

  for (const a of assignments) {
    assignmentByStaffDate.set(`${a.staff_id}:${a.target_date}`, a);
  }

  // Header row
  const header = ["スタッフ名", ...days.map((d) => formatShortDate(dayToDateString(yearMonth, d)))];

  // Data rows
  const rows = staffList.map((staff) => {
    const cells = days.map((day) => {
      const dateStr = dayToDateString(yearMonth, day);
      const assignment = assignmentByStaffDate.get(`${staff.id}:${dateStr}`);
      if (assignment) return patternMap.get(assignment.work_pattern_id) ?? "";
      if (dayOffSet.has(`${staff.id}:${dateStr}`)) return "休";
      return "";
    });
    return [fullName(staff), ...cells];
  });

  const ws = utils.aoa_to_sheet([header, ...rows]);

  // Column widths: first col wider, rest narrow
  ws["!cols"] = [{ wch: 14 }, ...days.map(() => ({ wch: 9 }))];

  const wb = utils.book_new();
  utils.book_append_sheet(wb, ws, "シフト表");
  writeFile(wb, `shift_${yearMonth}.xlsx`);
}
