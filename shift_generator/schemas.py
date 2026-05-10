from pydantic import BaseModel, UUID4
from typing import Optional
from datetime import date


class GenerateRequest(BaseModel):
    store_id: UUID4
    department_id: UUID4
    target_year_month: date  # 月初日 (例: 2026-06-01)
    overwrite_existing: bool = False


class StaffShortageReason(BaseModel):
    type: str  # "staff_shortage" | "day_off_excess" | "pattern_mismatch" | "consecutive_limit"
    target_date: Optional[date] = None
    work_pattern_id: Optional[UUID4] = None
    required: Optional[int] = None
    available: Optional[int] = None
    detail: Optional[str] = None


class StaffEvaluation(BaseModel):
    staff_id: UUID4
    workdays: int
    weekend_workdays: int
    monthly_minutes: int


class FairnessGroup(BaseModel):
    employment_type: str
    stddev_workdays: float
    stddev_minutes: float


class Evaluation(BaseModel):
    day_off_violations: int
    required_staff_shortage: int
    required_staff_excess: int
    consecutive_violations: int
    soft_constraint_violations: int
    per_staff: list[StaffEvaluation]
    fairness: list[FairnessGroup]


class GenerateResponse(BaseModel):
    status: str  # "success" | "infeasible" | "timeout_no_solution"
    shift_id: Optional[UUID4] = None
    assignments_count: Optional[int] = None
    solver_status: Optional[str] = None  # "OPTIMAL" | "FEASIBLE" | "UNKNOWN_WITH_SOLUTION" | "TIMEOUT_NO_SOLUTION" | "INFEASIBLE"
    evaluation: Optional[Evaluation] = None
    reasons: list[StaffShortageReason] = []


class EvaluateResponse(BaseModel):
    shift_id: UUID4
    evaluation: Evaluation
