from dataclasses import dataclass, field
from datetime import date
from data_loader import InputData


@dataclass
class SolveResult:
    status: str  # "success" | "infeasible" | "timeout_no_solution"
    solver_status: str  # "OPTIMAL" | "FEASIBLE" | "UNKNOWN_WITH_SOLUTION" | "TIMEOUT_NO_SOLUTION" | "INFEASIBLE"
    assignments: list[dict] = field(default_factory=list)
    # assignment: {"target_date": date, "work_pattern_id": str, "staff_id": str}


def solve(model, variables, data: InputData) -> SolveResult:
    # Sprint 9 以降で CP-SAT ソルバーを呼ぶ
    # v0 はランダム仮割当を返す（Sprint 7 で実装）
    return SolveResult(status="success", solver_status="OPTIMAL", assignments=[])
