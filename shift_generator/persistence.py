import os
from supabase import create_client
from schemas import GenerateRequest, GenerateResponse, Evaluation, StaffShortageReason
from solver_runner import SolveResult

SUPABASE_URL = os.environ["SUPABASE_URL"]
SUPABASE_SERVICE_ROLE_KEY = os.environ["SUPABASE_SERVICE_ROLE_KEY"]


def save_result(
    req: GenerateRequest,
    result: SolveResult,
    evaluation: Evaluation,
    reasons: list[StaffShortageReason],
) -> GenerateResponse:
    if result.status != "success":
        return GenerateResponse(
            status=result.status,
            solver_status=result.solver_status,
            reasons=reasons,
        )

    sb = create_client(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
    store_id = str(req.store_id)
    dept_id = str(req.department_id)
    ym = req.target_year_month.isoformat()

    # 1. 初回生成: INSERT ... ON CONFLICT DO NOTHING で二重INSERT防止
    insert_res = (
        sb.table("shifts")
        .insert({
            "target_year_month": ym,
            "store_id": store_id,
            "department_id": dept_id,
            "status": "draft",
        })
        .execute()
    )
    shift_id = insert_res.data[0]["id"] if insert_res.data else None

    # 2. 競合した場合（既存行あり）
    if shift_id is None:
        existing = (
            sb.table("shifts")
            .select("id, status")
            .eq("target_year_month", ym)
            .eq("store_id", store_id)
            .eq("department_id", dept_id)
            .single()
            .execute()
            .data
        )
        if not req.overwrite_existing:
            return GenerateResponse(
                status="shift_already_exists",
                shift_id=existing["id"],
                reasons=[],
            )
        shift_id = existing["id"]
        sb.table("shift_assignments").delete().eq("shift_id", shift_id).execute()
        sb.table("shifts").update({"status": "draft"}).eq("id", shift_id).execute()

    # 3. 割当を bulk INSERT
    if result.assignments:
        rows = [
            {
                "shift_id": shift_id,
                "target_date": a["target_date"].isoformat(),
                "work_pattern_id": a["work_pattern_id"],
                "staff_id": a["staff_id"],
                "assignment_type": "auto",
            }
            for a in result.assignments
        ]
        sb.table("shift_assignments").insert(rows).execute()

    return GenerateResponse(
        status="success",
        shift_id=shift_id,
        assignments_count=len(result.assignments),
        solver_status=result.solver_status,
        evaluation=evaluation,
        reasons=reasons,
    )
