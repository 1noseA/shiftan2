"use client";

import WorkPatternList from "@/app/manager/work-patterns/WorkPatternList";

type WorkPattern = {
  id: string;
  name: string;
  start_time: string;
  end_time: string;
  break_minutes: number;
  working_minutes: number;
  is_active: boolean;
};

export default function WorkPatternsTab({ patterns }: { patterns: WorkPattern[] }) {
  return <WorkPatternList patterns={patterns} />;
}
