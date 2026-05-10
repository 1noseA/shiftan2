from ortools.sat.python import cp_model
from data_loader import InputData


def build_model(data: InputData):
    # Sprint 9 以降で CP-SAT モデルを構築する
    # v0〜v3 はヒューリスティックで実装するためここは未使用
    model = cp_model.CpModel()
    variables = {}
    return model, variables
