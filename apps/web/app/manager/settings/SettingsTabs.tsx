"use client";

import { useState } from "react";
import BasicSettingsTab from "./BasicSettingsTab";
import WorkPatternsTab from "./WorkPatternsTab";
import RequiredStaffTab from "./RequiredStaffTab";
import AutoGenerationTab from "./AutoGenerationTab";
import RelationshipConstraintsTab from "./RelationshipConstraintsTab";

const TABS = [
  { id: "basic", label: "基本設定" },
  { id: "work-patterns", label: "勤務パターン" },
  { id: "required-staff", label: "必要人数" },
  { id: "auto-generation", label: "自動生成条件" },
  { id: "relationship", label: "人間関係制約" },
] as const;

type TabId = typeof TABS[number]["id"];

type Props = {
  shiftSettings: {
    day_off_request_deadline_day: number;
    day_off_max_per_month: number;
    updated_at: string;
  } | null;
  workPatterns: {
    id: string;
    name: string;
    start_time: string;
    end_time: string;
    break_minutes: number;
    working_minutes: number;
    is_active: boolean;
  }[];
  requiredCounts: {
    work_pattern_id: string;
    day_type: "weekday" | "holiday";
    required_count: number;
  }[];
  autoGenSettings: {
    enable_day_off_hard: boolean;
    enable_max_consecutive: boolean;
    enable_workable_pattern: boolean;
    enable_relationship_soft: boolean;
    enable_fairness: boolean;
  } | null;
  constraints: {
    id: string;
    staff_a_id: string;
    staff_b_id: string;
    reason: string | null;
    is_active: boolean;
    created_at: string;
    staff_a: { id: string; last_name: string; first_name: string };
    staff_b: { id: string; last_name: string; first_name: string };
  }[];
  staffList: { id: string; last_name: string; first_name: string }[];
};

export default function SettingsTabs(props: Props) {
  const [activeTab, setActiveTab] = useState<TabId>("basic");

  return (
    <div>
      <div className="border-b border-gray-200 mb-6 overflow-x-auto">
        <nav className="-mb-px flex gap-1 min-w-max">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`pb-3 px-3 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
                activeTab === tab.id
                  ? "border-blue-600 text-blue-600"
                  : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </nav>
      </div>

      {activeTab === "basic" && (
        <BasicSettingsTab settings={props.shiftSettings} />
      )}
      {activeTab === "work-patterns" && (
        <WorkPatternsTab patterns={props.workPatterns} />
      )}
      {activeTab === "required-staff" && (
        <RequiredStaffTab
          patterns={props.workPatterns.filter((p) => p.is_active)}
          counts={props.requiredCounts}
        />
      )}
      {activeTab === "auto-generation" && (
        <AutoGenerationTab settings={props.autoGenSettings} />
      )}
      {activeTab === "relationship" && (
        <RelationshipConstraintsTab
          constraints={props.constraints}
          staffList={props.staffList}
        />
      )}
    </div>
  );
}
