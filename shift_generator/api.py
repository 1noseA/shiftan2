from fastapi import FastAPI, Depends
from fastapi.middleware.cors import CORSMiddleware

from auth import require_manager
from schemas import GenerateRequest, GenerateResponse, EvaluateResponse
from data_loader import load_input_data
from model_builder import build_model
from solver_runner import solve
from evaluator import evaluate
from reason_analyzer import analyze_reasons
from persistence import save_result

app = FastAPI(title="shiftan2 generation engine")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # 本番では Next.js の URL に絞る
    allow_methods=["POST", "GET"],
    allow_headers=["Authorization"],
)


@app.get("/health")
def health():
    return {"status": "ok"}


@app.post("/api/v1/shifts/generate", response_model=GenerateResponse)
def generate_shift(
    req: GenerateRequest,
    _manager: dict = Depends(require_manager),
):
    data = load_input_data(req)
    model, variables = build_model(data)
    result = solve(model, variables, data)
    evaluation = evaluate(result, data)
    reasons = analyze_reasons(result, data)
    return save_result(req, result, evaluation, reasons)


@app.get("/api/v1/shifts/{shift_id}/evaluate", response_model=EvaluateResponse)
def evaluate_shift(
    shift_id: str,
    _manager: dict = Depends(require_manager),
):
    # Sprint 16 で実装
    raise NotImplementedError
