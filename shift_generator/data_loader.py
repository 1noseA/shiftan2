import os
from dataclasses import dataclass, field
from datetime import date
from supabase import create_client

SUPABASE_URL = os.environ["SUPABASE_URL"]
SUPABASE_SERVICE_ROLE_KEY = os.environ["SUPABASE_SERVICE_ROLE_KEY"]


@dataclass
class InputData:
    store_id: str
    department_id: str
    target_year_month: date
    staff: list[dict] = field(default_factory=list)
    work_patterns: list[dict] = field(default_factory=list)
    required_staff_counts: list[dict] = field(default_factory=list)
    day_off_requests: list[dict] = field(default_factory=list)
    settings: dict = field(default_factory=dict)
    relationship_constraints: list[dict] = field(default_factory=list)


def load_input_data(req) -> InputData:
    sb = create_client(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
    store_id = str(req.store_id)
    dept_id = str(req.department_id)

    staff = (
        sb.table("employees")
        .select("*")
        .eq("store_id", store_id)
        .eq("department_id", dept_id)
        .in_("role", ["manager", "staff"])
        .eq("is_active", True)
        .not_.is_("work_pattern_id", "null")
        .execute()
        .data
    )

    work_patterns = (
        sb.table("work_patterns")
        .select("*")
        .eq("is_active", True)
        .execute()
        .data
    )

    required_staff_counts = (
        sb.table("required_staff_counts")
        .select("*")
        .eq("store_id", store_id)
        .eq("department_id", dept_id)
        .execute()
        .data
    )

    year = req.target_year_month.year
    month = req.target_year_month.month
    staff_ids = [s["id"] for s in staff]
    day_off_requests = (
        sb.table("day_off_requests")
        .select("*")
        .in_("staff_id", staff_ids)
        .gte("target_date", f"{year}-{month:02d}-01")
        .lt("target_date", f"{year}-{month + 1:02d}-01" if month < 12 else f"{year + 1}-01-01")
        .execute()
        .data
    ) if staff_ids else []

    settings = (
        sb.table("auto_generation_settings")
        .select("*")
        .eq("store_id", store_id)
        .eq("department_id", dept_id)
        .single()
        .execute()
        .data
    )

    relationship_constraints = (
        sb.table("relationship_constraints")
        .select("*")
        .eq("store_id", store_id)
        .eq("department_id", dept_id)
        .eq("is_active", True)
        .execute()
        .data
    )

    return InputData(
        store_id=store_id,
        department_id=dept_id,
        target_year_month=req.target_year_month,
        staff=staff,
        work_patterns=work_patterns,
        required_staff_counts=required_staff_counts,
        day_off_requests=day_off_requests,
        settings=settings or {},
        relationship_constraints=relationship_constraints,
    )
