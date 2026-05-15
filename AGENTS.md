# AGENTS.md

This file provides guidance to Codex and other repository-aware coding agents when working with code in this repository.

## プロジェクト概要

スーパーマーケット向けシフト自動生成アプリ。現在は設計フェーズ完了後、実装を進めている状態。

## 技術スタック

| 役割 | 技術 | デプロイ先 |
|---|---|---|
| Webフロント | Next.js 14 App Router (TypeScript) | Vercel |
| 認証 + DB + RLS | Supabase (PostgreSQL) | Supabase Cloud |
| シフト生成エンジン | Python 3.11 FastAPI + OR-Tools CP-SAT | Render |
| Excel出力 | SheetJS（クライアントサイド、API化しない） | - |

## アーキテクチャの要点

### 通信パターン

```
Browser → Supabase (PostgREST)   # 通常のCRUD（RLSで制御）
Browser → Next.js → FastAPI      # シフト生成・評価のみ
Next.js Server → Supabase        # service_role（招待など管理操作）
FastAPI → Supabase               # service_role（生成結果の保存）
```

### 認証フロー

- Supabase Auth（メール + パスワード）が発行する JWT を全経路で使い回す
- Next.js → FastAPI 間は同じ user-jwt を Bearer で転送。FastAPI 側は Supabase の JWKS で署名検証する
- FastAPI が Supabase に書き込む際は service_role キーを使い RLS をバイパスする

### データアクセスの分担

- `shifts` / `shift_assignments` の INSERT / UPDATE / DELETE は **すべて RPC または FastAPI 経由のみ**。クライアントからの直接書き込みは不可
- 手動編集の競合は楽観ロック（`shifts.updated_at` の一致確認）で制御する RPC で処理する
- 初回シフト生成の二重 INSERT は `shifts` テーブルの UNIQUE 制約 `(target_year_month, store_id, department_id)` + `INSERT ... ON CONFLICT DO NOTHING` で防ぐ

## FastAPI（生成エンジン）の構成

```
shift_generator/
├── api.py            # エンドポイント・認可ガード
├── data_loader.py    # Supabase から入力取得
├── model_builder.py  # CP-SAT モデル構築（変数・制約の定義）
├── solver_runner.py  # 求解・結果抽出
├── evaluator.py      # 評価指標計算
├── reason_analyzer.py# 失敗原因分析・段階的緩和診断
├── persistence.py    # shifts UPSERT + shift_assignments INSERT
└── schemas.py        # Pydantic モデル
```

### CP-SAT モデルの設計上の注意

- 決定変数は `x[d, p, s]`（日付・勤務パターン・スタッフ）の3次元
- `enable_workable_pattern` が ON のとき `x` は `wp[s]` のパターンのみ生成（最適化）。OFF のときは全パターン生成
- `y[d, s] = Σ_p x[d,p,s]` は「その日に出勤したか」の派生変数。連勤制限・月間上限・公平性はすべてこの `y` を使う
- ソルバータイムアウト (`UNKNOWN`) は `INFEASIBLE`（制約矛盾の証明）と区別する。段階的緩和診断は `INFEASIBLE` 時のみ実施し、`TIMEOUT_NO_SOLUTION` では実施しない

### ソルバーステータスと API レスポンスの対応

| solver_status | API status |
|---|---|
| OPTIMAL / FEASIBLE | `success` |
| UNKNOWN_WITH_SOLUTION | `success`（警告付き） |
| TIMEOUT_NO_SOLUTION | `timeout_no_solution` |
| INFEASIBLE | `infeasible`（`reasons[]` 付き） |

## DB の重要な設計判断

- 削除は原則 **論理削除**（`is_active=false`）。物理削除はマスタの誤登録のみ
- `work_pattern_id IS NOT NULL` のスタッフのみシフト割当対象。office ロールは常に除外される
- `reasons[]` の各 type（`day_off_excess` / `pattern_mismatch` / `consecutive_limit`）は対応するフラグが ON のときのみ報告する

## 作業ルール

### スプリント実装完了時

1. `docs/tasks.md` の該当スプリントのタスクに全てチェックを入れる（`[ ]` → `[x]`）
2. コミットメッセージ候補を提案する（形式：`Sprint X：<内容>`）

## 設計書

実装の詳細は `docs/` を参照：

- `requirements.md` — 機能要件・スプリント計画
- `db_design.md` — テーブル定義・RLS・RPC
- `api_design.md` — エンドポイント・認証フロー
- `algorithm_design.md` — CP-SAT モデル・制約定義・失敗原因分析
- `screen_design.md` — 画面仕様
- `tasks.md` — スプリント別実装タスクリスト（チェックボックス形式）
