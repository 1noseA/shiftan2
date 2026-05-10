from solver_runner import SolveResult
from data_loader import InputData
from schemas import Evaluation


def evaluate(result: SolveResult, data: InputData) -> Evaluation:
    # Sprint 16 で実装
    return Evaluation(
        day_off_violations=0,
        required_staff_shortage=0,
        required_staff_excess=0,
        consecutive_violations=0,
        soft_constraint_violations=0,
        per_staff=[],
        fairness=[],
    )
