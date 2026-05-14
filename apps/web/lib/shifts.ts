export type ShiftStatus = "draft" | "published";

export type ShiftHeader = {
  id: string;
  status: ShiftStatus;
  updated_at: string;
};

export type ShiftAssignment = {
  id: string;
  target_date: string;
  work_pattern_id: string;
  staff_id: string;
  assignment_type: "auto" | "manual";
};

export type WorkPattern = {
  id: string;
  name: string;
  start_time: string;
  end_time: string;
  is_active: boolean;
};

export type StaffMember = {
  id: string;
  last_name: string;
  first_name: string;
  work_pattern_id: string;
  max_consecutive_workdays: number;
};

export type RequiredCount = {
  work_pattern_id: string;
  day_type: "weekday" | "holiday";
  required_count: number;
};

export type DayOffRequest = {
  staff_id: string;
  target_date: string;
};

export function fullName(staff: Pick<StaffMember, "last_name" | "first_name">) {
  return `${staff.last_name} ${staff.first_name}`;
}

export function formatYearMonthLabel(yearMonth: string) {
  const [year, month] = yearMonth.split("-").map(Number);
  return `${year}年${month}月`;
}

export function monthDays(yearMonth: string) {
  const [year, month] = yearMonth.split("-").map(Number);
  const daysInMonth = new Date(year, month, 0).getDate();
  return Array.from({ length: daysInMonth }, (_, index) => index + 1);
}

export function dayToDateString(yearMonth: string, day: number) {
  return `${yearMonth}-${String(day).padStart(2, "0")}`;
}

export function getDayOfWeek(dateString: string) {
  const [year, month, day] = dateString.split("-").map(Number);
  return new Date(year, month - 1, day).getDay();
}

export function getDayType(dateString: string): "weekday" | "holiday" {
  const day = getDayOfWeek(dateString);
  return day === 0 || day === 6 ? "holiday" : "weekday";
}

export function formatShortDate(dateString: string) {
  const [year, month, day] = dateString.split("-").map(Number);
  const dow = ["日", "月", "火", "水", "木", "金", "土"][new Date(year, month - 1, day).getDay()];
  return `${month}/${day}（${dow}）`;
}

export function shiftDate(dateString: string, delta: number) {
  const [year, month, day] = dateString.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day + delta));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(date.getUTCDate()).padStart(2, "0")}`;
}
